import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { supabaseAdmin } from "~/lib/supabase/admin";
export async function POST(
	request: Request,
	{ params }: { params: { sessionId: string } },
) {
	try {
		const { userId } = await auth();

		if (!userId) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const body = await request.json();
		const { title, description } = body;

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
				{ error: "Only facilitators can add stories" },
				{ status: 403 },
			);
		}

		// Get current story count for position
		const { count } = await supabaseAdmin
			.from("stories")
			.select("*", { count: "exact", head: true })
			.eq("session_id", params.sessionId);

		// Create story
		const { data: story, error } = await supabaseAdmin
			.from("stories")
			.insert({
				session_id: params.sessionId,
				title,
				description,
				position: count || 0,
			})
			.select()
			.single();

		if (error) {
			console.error("Error creating story:", error);
			return NextResponse.json({ error: error.message }, { status: 500 });
		}

		return NextResponse.json({ story });
	} catch (error) {
		console.error("Create story error:", error);
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
		const { storyId, final_estimate } = body;

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
				{ error: "Only facilitators can finalize estimates" },
				{ status: 403 },
			);
		}

		// Update story
		const { data: story, error } = await supabaseAdmin
			.from("stories")
			.update({
				final_estimate,
				is_estimated: true,
				updated_at: new Date().toISOString(),
			})
			.eq("id", storyId)
			.eq("session_id", params.sessionId)
			.select()
			.single();

		if (error) {
			console.error("Error updating story:", error);
			return NextResponse.json({ error: error.message }, { status: 500 });
		}

		return NextResponse.json({ story });
	} catch (error) {
		console.error("Update story error:", error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			{ status: 500 },
		);
	}
}
