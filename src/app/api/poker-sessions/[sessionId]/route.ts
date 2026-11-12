import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { reportError } from "~/lib/bugfixes";
import { db } from "~/lib/db";
import { RESULT_METHODS } from "~/lib/poker/score";
import { publicPokerVotes } from "~/lib/poker/vote-privacy";
export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ sessionId: string }> },
) {
	try {
		const resolvedParams = await params;
		const { userId } = await auth();
		const cookieStore = await cookies();
		const anonymousSessionId = cookieStore.get("anonymous_session_id")?.value;

		if (!userId && !anonymousSessionId) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		let isAuthorized = false;
		let viewerId: string | undefined;

		if (userId) {
			// Get user from database
			const { data: dbUser } = await db
				.from("users")
				.select("id")
				.eq("clerk_id", userId)
				.maybeSingle();

			if (!dbUser) {
				return NextResponse.json({ error: "User not found" }, { status: 404 });
			}

			viewerId = dbUser.id;
			// Check if user is a participant of this session
			const { data: participant } = await db
				.from("poker_participants")
				.select("*")
				.eq("session_id", resolvedParams.sessionId)
				.eq("user_id", dbUser.id)
				.maybeSingle();

			if (participant) {
				isAuthorized = true;
			}
		} else if (anonymousSessionId) {
			// Get anonymous user
			const { data: anonymousUser } = await db
				.from("anonymous_users")
				.select("id")
				.eq("session_id", anonymousSessionId)
				.maybeSingle();

			if (anonymousUser) {
				viewerId = anonymousUser.id;
				// Check if anonymous user is a participant
				const { data: participant } = await db
					.from("poker_anonymous_participants")
					.select("*")
					.eq("session_id", resolvedParams.sessionId)
					.eq("anonymous_user_id", anonymousUser.id)
					.maybeSingle();

				if (participant) {
					isAuthorized = true;
					// Anonymous users are always voters
				}
			}
		}

		if (!isAuthorized) {
			return NextResponse.json(
				{ error: "Not authorized to view this session" },
				{ status: 403 },
			);
		}

		// Fetch session with all related data
		const { data: session, error: sessionError } = await db
			.from("poker_sessions")
			.select(`
        *,
        stories(
          *,
          votes:poker_votes(
            *,
            user:users(id, name, avatar_url),
            anonymous_user:anonymous_users(id, display_name)
          )
        ),
        participants:poker_participants(
          user:users(id, name, avatar_url),
          role
        ),
        anonymous_participants:poker_anonymous_participants(
          anonymous_user:anonymous_users(id, display_name)
        )
      `)
			.eq("id", resolvedParams.sessionId)
			.single();

		if (sessionError || !session) {
			return NextResponse.json({ error: "Session not found" }, { status: 404 });
		}

		if (session.stories) {
			session.stories = session.stories.map(
				(story: { votes?: import("~/types/database").PokerVote[] }) => ({
					...story,
					votes: publicPokerVotes(
						story.votes ?? [],
						session.reveal_votes,
						viewerId,
						!userId,
					),
				}),
			);
		}
		// Sort stories by position
		if (session.stories) {
			session.stories.sort(
				(a: { position: number }, b: { position: number }) =>
					a.position - b.position,
			);
		}

		return NextResponse.json({ session });
	} catch (error) {
		reportError("Get session error:", error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			{ status: 500 },
		);
	}
}

export async function PATCH(
	request: Request,
	{ params }: { params: Promise<{ sessionId: string }> },
) {
	try {
		const resolvedParams = await params;
		const { userId } = await auth();

		if (!userId) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const body = await request.json();
		const { current_story_id, reveal_votes, result_method } = body;
		if (
			result_method !== undefined &&
			!RESULT_METHODS.includes(result_method)
		) {
			return NextResponse.json(
				{ error: "Invalid result method" },
				{ status: 400 },
			);
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
				{ error: "Only facilitators can modify sessions" },
				{ status: 403 },
			);
		}

		// Update session
		const updateData: {
			current_story_id?: string;
			reveal_votes?: boolean;
			result_method?: string;
		} = {};
		// Changing the method doesn't re-score stories already estimated
		if (result_method !== undefined) updateData.result_method = result_method;
		if (current_story_id !== undefined)
			updateData.current_story_id = current_story_id;
		if (reveal_votes !== undefined) updateData.reveal_votes = reveal_votes;

		const { data: session, error } = await db
			.from("poker_sessions")
			.update(updateData)
			.eq("id", resolvedParams.sessionId)
			.select()
			.single();

		if (error) {
			reportError("Error updating session:", error);
			return NextResponse.json({ error: error.message }, { status: 500 });
		}

		return NextResponse.json({ session });
	} catch (error) {
		reportError("Update session error:", error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			{ status: 500 },
		);
	}
}
