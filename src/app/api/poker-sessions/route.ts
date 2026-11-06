import { auth } from "@clerk/nextjs/server";
import { error as reportError } from "bugfixes";
import { NextResponse } from "next/server";

import { db } from "~/lib/db";
import { PokerChannelClient } from "~/lib/realtime/poker-channel";
import { serverRealtime } from "~/lib/realtime/server";

export async function GET() {
	try {
		const { userId } = await auth();

		if (!userId) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		// Get user from database
		const { data: dbUser, error: userError } = await db
			.from("users")
			.select("id")
			.eq("clerk_id", userId)
			.maybeSingle();

		if (userError) {
			reportError("Error fetching user:", userError);
			return NextResponse.json({ error: userError.message }, { status: 500 });
		}

		if (!dbUser) {
			return NextResponse.json(
				{ error: "User not found in database" },
				{ status: 404 },
			);
		}

		// Fetch all sessions where user is owner OR participant
		const { data: sessions, error: sessionsError } = await db
			.from("poker_sessions")
			.select(`
				*,
				participants:poker_participants(count)
			`)
			.or(`owner_id.eq.${dbUser.id}`)
			.order("created_at", { ascending: false });

		if (sessionsError) {
			reportError("Error fetching sessions:", sessionsError);
			return NextResponse.json(
				{ error: sessionsError.message },
				{ status: 500 },
			);
		}

		// Also fetch sessions where user is a participant
		const { data: participantSessions, error: participantError } = await db
			.from("poker_participants")
			.select(`
				session:poker_sessions(
					*,
					participants:poker_participants(count)
				)
			`)
			.eq("user_id", dbUser.id);

		if (participantError) {
			reportError("Error fetching participant sessions:", participantError);
			return NextResponse.json(
				{ error: participantError.message },
				{ status: 500 },
			);
		}

		// Combine and deduplicate sessions
		const allSessions = [...(sessions || [])];
		const participantSessionIds = new Set(allSessions.map((s) => s.id));

		if (participantSessions) {
			for (const ps of participantSessions) {
				if (
					ps.session &&
					typeof ps.session === "object" &&
					"id" in ps.session &&
					!participantSessionIds.has(ps.session.id)
				) {
					allSessions.push(ps.session);
				}
			}
		}

		// Sort by created_at descending
		allSessions.sort(
			(a, b) =>
				new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
		);

		return NextResponse.json({ sessions: allSessions });
	} catch (error) {
		reportError("Get poker sessions error:", error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			{ status: 500 },
		);
	}
}

export async function POST(request: Request) {
	try {
		const { userId } = await auth();

		if (!userId) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const body = await request.json();
		const { name, description, estimation_type } = body;

		// Get user from database
		const { data: dbUser, error: userError } = await db
			.from("users")
			.select("id")
			.eq("clerk_id", userId)
			.maybeSingle();

		if (userError) {
			reportError("Error fetching user:", userError);
			return NextResponse.json({ error: userError.message }, { status: 500 });
		}

		if (!dbUser) {
			return NextResponse.json(
				{ error: "User not found in database" },
				{ status: 404 },
			);
		}

		// Create session
		const { data: session, error: sessionError } = await db
			.from("poker_sessions")
			.insert({
				name,
				description,
				owner_id: dbUser.id,
				estimation_type,
			})
			.select()
			.single();

		if (sessionError) {
			reportError("Error creating session:", sessionError);
			return NextResponse.json(
				{ error: sessionError.message },
				{ status: 500 },
			);
		}

		// Add owner as facilitator
		const { error: participantError } = await db
			.from("poker_participants")
			.insert({
				session_id: session.id,
				user_id: dbUser.id,
				role: "facilitator",
			});

		if (participantError) {
			reportError("Error adding participant:", participantError);
			// Don't fail the whole operation if participant add fails
		}

		// Initialize the poker channel for this session
		// This ensures the channel is ready when participants join
		try {
			const channel = new PokerChannelClient(session.id, serverRealtime);
			await channel.connect(dbUser.id);

			// Send an initial join message as the facilitator
			await channel.join("facilitator", dbUser.id, undefined, undefined);

			// Disconnect after initialization (participants will reconnect when they join)
			await channel.disconnect();
		} catch (channelError) {
			reportError("Error initializing poker channel:", channelError);
			// Don't fail the session creation if channel init fails
		}

		return NextResponse.json({ session });
	} catch (error) {
		reportError("Create poker session error:", error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			{ status: 500 },
		);
	}
}
