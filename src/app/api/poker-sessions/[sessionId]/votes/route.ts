import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { supabaseAdmin } from "~/lib/supabase/admin";
export async function POST(
	request: Request,
	{ params }: { params: { sessionId: string } },
) {
	try {
		const { userId } = await auth();
		const cookieStore = await cookies();
		const anonymousSessionId = cookieStore.get("anonymous_session_id")?.value;

		if (!userId && !anonymousSessionId) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const body = await request.json();
		const { storyId, vote } = body;

		let dbUserId: string | null = null;
		let anonymousUserId: string | null = null;
		let isAuthorized = false;

		if (userId) {
			// Get user from database
			const { data: dbUser } = await supabaseAdmin
				.from("users")
				.select("id")
				.eq("clerk_id", userId)
				.maybeSingle();

			if (!dbUser) {
				return NextResponse.json({ error: "User not found" }, { status: 404 });
			}

			dbUserId = dbUser.id;

			// Check if user is participant
			const { data: participant } = await supabaseAdmin
				.from("poker_participants")
				.select("*")
				.eq("session_id", params.sessionId)
				.eq("user_id", dbUser.id)
				.maybeSingle();

			if (participant) {
				isAuthorized = true;
			}
		} else if (anonymousSessionId) {
			// Get anonymous user
			const { data: anonymousUser } = await supabaseAdmin
				.from("anonymous_users")
				.select("id")
				.eq("session_id", anonymousSessionId)
				.maybeSingle();

			if (!anonymousUser) {
				return NextResponse.json(
					{ error: "Anonymous user not found" },
					{ status: 404 },
				);
			}

			anonymousUserId = anonymousUser.id;

			// Check if anonymous user is participant
			const { data: participant } = await supabaseAdmin
				.from("poker_anonymous_participants")
				.select("*")
				.eq("session_id", params.sessionId)
				.eq("anonymous_user_id", anonymousUser.id)
				.maybeSingle();

			if (participant) {
				isAuthorized = true;
			}
		}

		if (!isAuthorized) {
			return NextResponse.json(
				{ error: "Not authorized to vote in this session" },
				{ status: 403 },
			);
		}

		// Check if user already voted
		let existingVote = null;
		if (dbUserId) {
			const { data } = await supabaseAdmin
				.from("poker_votes")
				.select("id")
				.eq("story_id", storyId)
				.eq("user_id", dbUserId)
				.maybeSingle();
			existingVote = data;
		} else if (anonymousUserId) {
			const { data } = await supabaseAdmin
				.from("poker_votes")
				.select("id")
				.eq("story_id", storyId)
				.eq("anonymous_user_id", anonymousUserId)
				.maybeSingle();
			existingVote = data;
		}

		if (existingVote) {
			// Update existing vote
			const { error } = await supabaseAdmin
				.from("poker_votes")
				.update({ vote_value: vote })
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
				vote_value: vote,
			};

			if (dbUserId) {
				voteData.user_id = dbUserId;
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

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error("Vote error:", error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			{ status: 500 },
		);
	}
}
