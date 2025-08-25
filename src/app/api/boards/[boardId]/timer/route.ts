import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "~/lib/supabase/admin";
import {
	broadcastToBoard,
	type TimerEventPayload,
} from "~/lib/supabase/channels-server";

export async function PATCH(
	request: Request,
	{ params }: { params: Promise<{ boardId: string }> },
) {
	try {
		const resolvedParams = await params;
		const { userId } = await auth();

		if (!userId) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const body = await request.json();
		const { action, duration } = body; // action: "extend", duration: additional minutes

		// Get user from database
		const { data: dbUser } = await supabaseAdmin
			.from("users")
			.select("id")
			.eq("clerk_id", userId)
			.maybeSingle();

		if (!dbUser) {
			return NextResponse.json({ error: "User not found" }, { status: 404 });
		}

		// Get board and check ownership
		const { data: board } = await supabaseAdmin
			.from("boards")
			.select("*")
			.eq("id", resolvedParams.boardId)
			.single();

		if (!board) {
			return NextResponse.json({ error: "Board not found" }, { status: 404 });
		}

		if (board.owner_id !== dbUser.id) {
			return NextResponse.json(
				{ error: "Only board owners can manage the timer" },
				{ status: 403 },
			);
		}

		let newPhaseEndsAt: string | null = null;

		if (action === "extend" && duration > 0) {
			// Extend the timer
			if (board.phase_ends_at) {
				const currentEnd = new Date(board.phase_ends_at);
				const newEnd = new Date(currentEnd.getTime() + duration * 60 * 1000);
				newPhaseEndsAt = newEnd.toISOString();
			} else {
				// If timer not running, start it with the duration
				const now = new Date();
				const endsAt = new Date(now.getTime() + duration * 60 * 1000);
				newPhaseEndsAt = endsAt.toISOString();
			}
		}

		const updateData = newPhaseEndsAt ? { phase_ends_at: newPhaseEndsAt } : {};

		// Update board
		const { data: updatedBoard, error } = await supabaseAdmin
			.from("boards")
			.update(updateData)
			.eq("id", resolvedParams.boardId)
			.select()
			.single();

		if (error) {
			console.error("Error updating board timer:", error);
			return NextResponse.json({ error: error.message }, { status: 500 });
		}

		// Broadcast timer extended event
		const timerPayload: TimerEventPayload = {
			action: "extend",
			duration: duration * 60, // Convert to seconds
		};
		await broadcastToBoard(
			resolvedParams.boardId,
			"timer_extended",
			timerPayload,
		);

		return NextResponse.json({ board: updatedBoard });
	} catch (error) {
		console.error("Timer extension error:", error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			{ status: 500 },
		);
	}
}
