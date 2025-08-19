import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { supabaseAdmin } from "~/lib/supabase/admin";
export async function GET(
	_request: Request,
	{ params }: { params: { sessionId: string } },
) {
	try {
		const { userId } = await auth();
		const cookieStore = await cookies();
		const anonymousSessionId = cookieStore.get("anonymous_session_id")?.value;

		if (!userId && !anonymousSessionId) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

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

			// Check if user is a participant of this session
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

			if (anonymousUser) {
				// Check if anonymous user is a participant
				const { data: participant } = await supabaseAdmin
					.from("poker_anonymous_participants")
					.select("*")
					.eq("session_id", params.sessionId)
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
		const { data: session, error: sessionError } = await supabaseAdmin
			.from("poker_sessions")
			.select(`
        *,
        stories(
          *,
          votes:poker_votes(
            *,
            user:users(*),
            anonymous_user:anonymous_users(*)
          )
        ),
        participants:poker_participants(
          user:users(*),
          role
        ),
        anonymous_participants:poker_anonymous_participants(
          anonymous_user:anonymous_users(*)
        )
      `)
			.eq("id", params.sessionId)
			.single();

		if (sessionError || !session) {
			return NextResponse.json({ error: "Session not found" }, { status: 404 });
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
		console.error("Get session error:", error);
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
	{ params }: { params: { sessionId: string } },
) {
	try {
		const { userId } = await auth();

		if (!userId) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const body = await request.json();
		const { current_story_id, reveal_votes } = body;

		// Get user from database
		const { data: dbUser } = await supabaseAdmin
			.from("users")
			.select("id")
			.eq("clerk_id", userId)
			.maybeSingle();

		if (!dbUser) {
			return NextResponse.json({ error: "User not found" }, { status: 404 });
		}

		// Check if user is facilitator
		const { data: facilitator } = await supabaseAdmin
			.from("poker_participants")
			.select("*")
			.eq("session_id", params.sessionId)
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
		} = {};
		if (current_story_id !== undefined)
			updateData.current_story_id = current_story_id;
		if (reveal_votes !== undefined) updateData.reveal_votes = reveal_votes;

		const { data: session, error } = await supabaseAdmin
			.from("poker_sessions")
			.update(updateData)
			.eq("id", params.sessionId)
			.select()
			.single();

		if (error) {
			console.error("Error updating session:", error);
			return NextResponse.json({ error: error.message }, { status: 500 });
		}

		return NextResponse.json({ session });
	} catch (error) {
		console.error("Update session error:", error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			{ status: 500 },
		);
	}
}
