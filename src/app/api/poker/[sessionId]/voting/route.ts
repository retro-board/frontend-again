import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "~/lib/supabase/admin";

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ sessionId: string }> },
) {
	try {
		const resolvedParams = await params;
		const url = new URL(request.url);
		const storyId = url.searchParams.get("storyId");

		if (!storyId) {
			return NextResponse.json({ error: "Story ID required" }, { status: 400 });
		}

		// Get participants (excluding abstaining ones)
		const { data: participants } = await supabaseAdmin
			.from("poker_participants")
			.select("*")
			.eq("session_id", resolvedParams.sessionId)
			.eq("role", "voter")
			.eq("is_abstaining", false);

		const eligibleVoters = participants?.length || 0;

		// Get votes for the story
		const { data: votes } = await supabaseAdmin
			.from("poker_votes")
			.select("*")
			.eq("story_id", storyId);

		const votesReceived = votes?.length || 0;

		// Check if all eligible voters have voted
		const isComplete = eligibleVoters > 0 && votesReceived >= eligibleVoters;

		// Get timer status
		const { data: session } = await supabaseAdmin
			.from("poker_sessions")
			.select("timer_ends_at")
			.eq("id", resolvedParams.sessionId)
			.single();

		const isTimerExpired = session?.timer_ends_at
			? new Date(session.timer_ends_at) < new Date()
			: false;

		return NextResponse.json({
			eligibleVoters,
			votesReceived,
			isComplete,
			isTimerExpired,
			shouldEndVoting: isComplete || isTimerExpired,
		});
	} catch (error) {
		console.error("Voting status error:", error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			{ status: 500 },
		);
	}
}

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ sessionId: string }> },
) {
	try {
		const resolvedParams = await params;
		const { userId } = await auth();
		const body = await request.json();
		const { action, storyId, timerDuration } = body;

		if (!storyId || !action) {
			return NextResponse.json(
				{ error: "Story ID and action required" },
				{ status: 400 },
			);
		}

		// Verify user is the facilitator
		const { data: session } = await supabaseAdmin
			.from("poker_sessions")
			.select("owner_id")
			.eq("id", resolvedParams.sessionId)
			.single();

		if (!session) {
			return NextResponse.json({ error: "Session not found" }, { status: 404 });
		}

		if (userId) {
			const { data: dbUser } = await supabaseAdmin
				.from("users")
				.select("id")
				.eq("clerk_id", userId)
				.single();

			if (!dbUser || dbUser.id !== session.owner_id) {
				return NextResponse.json(
					{ error: "Only the facilitator can control voting" },
					{ status: 403 },
				);
			}
		}

		if (action === "start") {
			// Update current story and start timer if provided
			const updates: {
				current_story_id: string;
				reveal_votes: boolean;
				updated_at: string;
				timer_seconds?: number;
				timer_started_at?: string;
				timer_ends_at?: string;
			} = {
				current_story_id: storyId,
				reveal_votes: false,
				updated_at: new Date().toISOString(),
			};

			if (timerDuration) {
				updates.timer_seconds = timerDuration;
				updates.timer_started_at = new Date().toISOString();
				updates.timer_ends_at = new Date(
					Date.now() + timerDuration * 1000,
				).toISOString();
			}

			const { error } = await supabaseAdmin
				.from("poker_sessions")
				.update(updates)
				.eq("id", resolvedParams.sessionId);

			if (error) {
				console.error("Error starting voting:", error);
				return NextResponse.json({ error: error.message }, { status: 500 });
			}

			// Clear any existing votes for this story
			await supabaseAdmin.from("poker_votes").delete().eq("story_id", storyId);

			return NextResponse.json({ success: true, action: "started" });
		}
		if (action === "end") {
			// Stop timer and reveal votes
			const { error } = await supabaseAdmin
				.from("poker_sessions")
				.update({
					reveal_votes: true,
					timer_started_at: null,
					timer_ends_at: null,
					updated_at: new Date().toISOString(),
				})
				.eq("id", resolvedParams.sessionId);

			if (error) {
				console.error("Error ending voting:", error);
				return NextResponse.json({ error: error.message }, { status: 500 });
			}

			return NextResponse.json({ success: true, action: "ended" });
		}

		return NextResponse.json({ error: "Invalid action" }, { status: 400 });
	} catch (error) {
		console.error("Voting control error:", error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			{ status: 500 },
		);
	}
}
