import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "~/lib/supabase/admin";

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ sessionId: string }> },
) {
	try {
		const _resolvedParams = await params;
		const { userId } = await auth();
		const body = await request.json();
		const { storyId, voteValue, anonymousUserId } = body;

		if (!storyId || !voteValue) {
			return NextResponse.json(
				{ error: "Story ID and vote value required" },
				{ status: 400 },
			);
		}

		// Determine the user identifier
		let voteUserId: string | null = null;

		if (userId) {
			// Get user from database
			const { data: dbUser } = await supabaseAdmin
				.from("users")
				.select("id")
				.eq("clerk_id", userId)
				.single();

			if (dbUser) {
				voteUserId = dbUser.id;
			}
		}

		// Check if user has already voted
		const existingVoteQuery = supabaseAdmin
			.from("poker_votes")
			.select("id")
			.eq("story_id", storyId);

		if (voteUserId) {
			existingVoteQuery.eq("user_id", voteUserId);
		} else if (anonymousUserId) {
			existingVoteQuery.eq("anonymous_user_id", anonymousUserId);
		} else {
			return NextResponse.json(
				{ error: "User identification required" },
				{ status: 401 },
			);
		}

		const { data: existingVote } = await existingVoteQuery.single();

		if (existingVote) {
			// Update existing vote
			const { error } = await supabaseAdmin
				.from("poker_votes")
				.update({
					vote_value: voteValue,
					created_at: new Date().toISOString(),
				})
				.eq("id", existingVote.id);

			if (error) {
				console.error("Error updating vote:", error);
				return NextResponse.json({ error: error.message }, { status: 500 });
			}
		} else {
			// Create new vote
			const voteData: {
				story_id: string;
				vote_value: string;
				user_id?: string;
				anonymous_user_id?: string;
			} = {
				story_id: storyId,
				vote_value: voteValue,
			};

			if (voteUserId) {
				voteData.user_id = voteUserId;
			} else if (anonymousUserId) {
				voteData.anonymous_user_id = anonymousUserId;
			}

			const { error } = await supabaseAdmin
				.from("poker_votes")
				.insert(voteData);

			if (error) {
				console.error("Error creating vote:", error);
				return NextResponse.json({ error: error.message }, { status: 500 });
			}
		}

		return NextResponse.json({ success: true, voteValue });
	} catch (error) {
		console.error("Vote submission error:", error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			{ status: 500 },
		);
	}
}
