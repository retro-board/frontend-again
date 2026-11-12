import { NextResponse } from "next/server";
import { reportError } from "~/lib/bugfixes";
import { db } from "~/lib/db";
import {
	authorizeLegacyPoker,
	requireSessionStory,
} from "~/lib/poker/legacy-authorization";

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ sessionId: string }> },
) {
	try {
		const resolvedParams = await params;
		const authorization = await authorizeLegacyPoker(
			resolvedParams.sessionId,
			false,
		);
		if (authorization.response) return authorization.response;
		const identity = authorization.identity;
		const body = await request.json();
		const { storyId, voteValue } = body;

		if (!storyId || !voteValue) {
			return NextResponse.json(
				{ error: "Story ID and vote value required" },
				{ status: 400 },
			);
		}

		const storyError = await requireSessionStory(
			resolvedParams.sessionId,
			storyId,
		);
		if (storyError) return storyError;

		// Determine the user identifier
		let voteUserId: string | null = null;

		const anonymousUserId = identity.anonymous ? identity.user.id : undefined;
		voteUserId = identity.anonymous ? null : identity.user.id;

		// Check if user has already voted
		const existingVoteQuery = db
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
			const { error } = await db
				.from("poker_votes")
				.update({
					vote_value: voteValue,
					created_at: new Date().toISOString(),
				})
				.eq("id", existingVote.id);

			if (error) {
				reportError("Error updating vote:", error);
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

			const { error } = await db.from("poker_votes").insert(voteData);

			if (error) {
				reportError("Error creating vote:", error);
				return NextResponse.json({ error: error.message }, { status: 500 });
			}
		}

		return NextResponse.json({ success: true, voteValue });
	} catch (error) {
		reportError("Vote submission error:", error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			{ status: 500 },
		);
	}
}
