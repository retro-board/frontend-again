import { auth } from "@clerk/nextjs/server";
import { error as reportError } from "bugfixes";
import { NextResponse } from "next/server";

import { db } from "~/lib/db";
import { PokerChannelClient } from "~/lib/realtime/poker-channel";
import { serverRealtime } from "~/lib/realtime/server";
export async function POST(
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
		const { title, description } = body;

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
				{ error: "Only facilitators can add stories" },
				{ status: 403 },
			);
		}

		// Get current story count for position
		const { count } = await db
			.from("stories")
			.select("*", { count: "exact", head: true })
			.eq("session_id", resolvedParams.sessionId);

		// Create story
		const { data: story, error } = await db
			.from("stories")
			.insert({
				session_id: resolvedParams.sessionId,
				title,
				description,
				position: count || 0,
			})
			.select()
			.single();

		if (error) {
			reportError("Error creating story:", error);
			return NextResponse.json({ error: error.message }, { status: 500 });
		}

		// Broadcast story creation to channel
		try {
			const channel = new PokerChannelClient(
				resolvedParams.sessionId,
				serverRealtime,
			);
			await channel.connect(dbUser.id);
			await channel.createStory(
				{
					id: story.id,
					title: story.title,
					description: story.description || undefined,
					position: story.position,
				},
				dbUser.id,
			);
			await channel.disconnect();
		} catch (channelError) {
			reportError("Error broadcasting story creation:", channelError);
			// Don't fail the request if broadcasting fails
		}

		return NextResponse.json({ story });
	} catch (error) {
		reportError("Create story error:", error);
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
		const { storyId, final_estimate } = body;

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
				{ error: "Only facilitators can finalize estimates" },
				{ status: 403 },
			);
		}

		// Update story
		const { data: story, error } = await db
			.from("stories")
			.update({
				final_estimate,
				is_estimated: true,
				updated_at: new Date().toISOString(),
			})
			.eq("id", storyId)
			.eq("session_id", resolvedParams.sessionId)
			.select()
			.single();

		if (error) {
			reportError("Error updating story:", error);
			return NextResponse.json({ error: error.message }, { status: 500 });
		}

		return NextResponse.json({ story });
	} catch (error) {
		reportError("Update story error:", error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			{ status: 500 },
		);
	}
}
