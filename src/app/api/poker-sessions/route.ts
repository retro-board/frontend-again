import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { supabaseAdmin } from "~/lib/supabase/admin";

export async function GET() {
	try {
		const { userId } = await auth();

		if (!userId) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		// Get user from database
		const { data: dbUser, error: userError } = await supabaseAdmin
			.from("users")
			.select("id")
			.eq("clerk_id", userId)
			.maybeSingle();

		if (userError) {
			console.error("Error fetching user:", userError);
			return NextResponse.json({ error: userError.message }, { status: 500 });
		}

		if (!dbUser) {
			return NextResponse.json(
				{ error: "User not found in database" },
				{ status: 404 },
			);
		}

		// Fetch all sessions where user is owner OR participant
		const { data: sessions, error: sessionsError } = await supabaseAdmin
			.from("poker_sessions")
			.select(`
				*,
				participants:poker_participants(count)
			`)
			.or(`owner_id.eq.${dbUser.id}`)
			.order("created_at", { ascending: false });

		if (sessionsError) {
			console.error("Error fetching sessions:", sessionsError);
			return NextResponse.json(
				{ error: sessionsError.message },
				{ status: 500 },
			);
		}

		// Also fetch sessions where user is a participant
		const { data: participantSessions, error: participantError } =
			await supabaseAdmin
				.from("poker_participants")
				.select(`
				session:poker_sessions(
					*,
					participants:poker_participants(count)
				)
			`)
				.eq("user_id", dbUser.id);

		if (participantError) {
			console.error("Error fetching participant sessions:", participantError);
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
				// @ts-ignore - Supabase types don't properly handle nested selects
				if (
					ps.session &&
					typeof ps.session === "object" &&
					"id" in ps.session &&
					!participantSessionIds.has(ps.session.id)
				) {
					allSessions.push(ps.session as any);
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
		console.error("Get poker sessions error:", error);
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
		const { data: dbUser, error: userError } = await supabaseAdmin
			.from("users")
			.select("id")
			.eq("clerk_id", userId)
			.maybeSingle();

		if (userError) {
			console.error("Error fetching user:", userError);
			return NextResponse.json({ error: userError.message }, { status: 500 });
		}

		if (!dbUser) {
			return NextResponse.json(
				{ error: "User not found in database" },
				{ status: 404 },
			);
		}

		// Create session
		const { data: session, error: sessionError } = await supabaseAdmin
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
			console.error("Error creating session:", sessionError);
			return NextResponse.json(
				{ error: sessionError.message },
				{ status: 500 },
			);
		}

		// Add owner as facilitator
		const { error: participantError } = await supabaseAdmin
			.from("poker_participants")
			.insert({
				session_id: session.id,
				user_id: dbUser.id,
				role: "facilitator",
			});

		if (participantError) {
			console.error("Error adding participant:", participantError);
			// Don't fail the whole operation if participant add fails
		}

		return NextResponse.json({ session });
	} catch (error) {
		console.error("Create poker session error:", error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			{ status: 500 },
		);
	}
}
