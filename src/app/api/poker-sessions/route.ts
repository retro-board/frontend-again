import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { supabaseAdmin } from "~/lib/supabase/admin";
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
