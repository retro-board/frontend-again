import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { reportError } from "~/lib/bugfixes";
import { db } from "~/lib/db";
import { type ResultMethod, scoreVotes } from "~/lib/poker/score";

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ sessionId: string }> },
) {
	try {
		const resolvedParams = await params;
		const { userId } = await auth();
		const { storyId, pick } = await request.json();

		if (!userId) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		// Get user from database
		const { data: dbUser } = await db
			.from("users")
			.select("id")
			.eq("clerk_id", userId)
			.maybeSingle();

		if (!dbUser) {
			return NextResponse.json({ error: "User not found" }, { status: 404 });
		}

		// Check if user is facilitator
		const { data: facilitator } = await db
			.from("poker_participants")
			.select("*")
			.eq("session_id", resolvedParams.sessionId)
			.eq("user_id", dbUser.id)
			.eq("role", "facilitator")
			.maybeSingle();

		if (!facilitator) {
			return NextResponse.json(
				{ error: "Only facilitators can calculate scores" },
				{ status: 403 },
			);
		}

		// Get session
		const { data: session } = await db
			.from("poker_sessions")
			.select("estimation_type, result_method")
			.eq("id", resolvedParams.sessionId)
			.single();

		if (!session) {
			return NextResponse.json({ error: "Session not found" }, { status: 404 });
		}

		// Get all votes for this story (excluding abstainers)
		const { data: votes } = await db
			.from("poker_votes")
			.select(`
				vote_value,
				user_id,
				anonymous_user_id,
				users!poker_votes_user_id_fkey(name, email),
				anonymous_users(display_name)
			`)
			.eq("story_id", storyId)
			.neq("vote_value", "abstain");

		if (!votes || votes.length === 0) {
			return NextResponse.json(
				{ error: "No votes found for this story" },
				{ status: 404 },
			);
		}

		// Calculate the final score
		const voteValues = votes.map((v) => v.vote_value);
		const resultMethod: ResultMethod = session.result_method ?? "average";
		const result = scoreVotes(
			voteValues,
			session.estimation_type,
			resultMethod,
			typeof pick === "string" ? pick : undefined,
		);

		// A most-common tie: nothing is saved until the facilitator picks one of the tied values
		if ("tie" in result) {
			return NextResponse.json({ tie: result.tie, resultMethod });
		}
		const { finalScore, tiedValues } = result;

		// Update the story with the final estimate
		await db
			.from("stories")
			.update({
				final_estimate: finalScore,
				is_estimated: true,
				estimated_at: new Date().toISOString(),
				result_method: resultMethod,
				tied_values: tiedValues,
			})
			.eq("id", storyId);

		// Format votes for response
		const voteMap: Record<string, string> = {};
		for (const vote of votes) {
			// biome-ignore lint/suspicious/noExplicitAny: Database relation type
			const user = vote.users as any;
			// biome-ignore lint/suspicious/noExplicitAny: Database relation type
			const anonUser = vote.anonymous_users as any;
			const voterName =
				user?.name || user?.email || anonUser?.display_name || "Anonymous";
			voteMap[voterName] = vote.vote_value;
		}

		return NextResponse.json({
			finalScore,
			votes: voteMap,
			resultMethod,
			tiedValues,
		});
	} catch (error) {
		reportError("Score calculation error:", error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			{ status: 500 },
		);
	}
}
