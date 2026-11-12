import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { reportError } from "~/lib/bugfixes";
import { db } from "~/lib/db";
import { authorizeChannel } from "~/lib/realtime/authorize";
import { broadcastBoardEvent } from "~/lib/realtime/broadcast";

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ boardId: string }> },
) {
	try {
		const resolvedParams = await params;
		const { userId } = await auth();
		const cookieStore = await cookies();
		const anonymousSessionId = cookieStore.get("anonymous_session_id")?.value;

		if (!userId && !anonymousSessionId) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		if (!(await authorizeChannel(`board:${resolvedParams.boardId}`)))
			return NextResponse.json({ error: "Forbidden" }, { status: 403 });

		// Get board details
		const { data: board } = await db
			.from("boards")
			.select("votes_per_user, phase")
			.eq("id", resolvedParams.boardId)
			.single();

		if (!board) {
			return NextResponse.json({ error: "Board not found" }, { status: 404 });
		}

		// Only check voting status during voting phase
		if (board.phase !== "voting") {
			return NextResponse.json({ allVotesUsed: false });
		}

		// Registered and anonymous participants are stored in separate tables.
		const { data: registered, error: registeredError } = await db
			.from("board_participants")
			.select("user_id")
			.eq("board_id", resolvedParams.boardId);
		const { data: anonymous, error: anonymousError } = await db
			.from("board_anonymous_participants")
			.select("anonymous_user_id")
			.eq("board_id", resolvedParams.boardId);
		if (registeredError || anonymousError)
			return NextResponse.json(
				{ error: "Failed to load participants" },
				{ status: 500 },
			);
		const participants = [...(registered ?? []), ...(anonymous ?? [])];

		if (!participants || participants.length === 0) {
			return NextResponse.json({ allVotesUsed: false });
		}

		// Get all non-action columns for this board
		const { data: columns } = await db
			.from("columns")
			.select("id")
			.eq("board_id", resolvedParams.boardId)
			.eq("is_action", false);

		if (!columns) {
			return NextResponse.json({ allVotesUsed: false });
		}

		const columnIds = columns.map((col) => col.id);

		// Get all cards in non-action columns
		const { data: cards } = await db
			.from("cards")
			.select("id")
			.in("column_id", columnIds);

		if (!cards) {
			return NextResponse.json({ allVotesUsed: false });
		}

		const cardIds = cards.map((card) => card.id);

		// Check vote counts for each participant
		let allVotesUsed = true;

		for (const participant of participants) {
			const votesQuery = db
				.from("card_votes")
				.select("id")
				.in("card_id", cardIds);

			if (participant.user_id) {
				votesQuery.eq("user_id", participant.user_id);
			} else if (participant.anonymous_user_id) {
				votesQuery.eq("anonymous_user_id", participant.anonymous_user_id);
			} else {
				continue; // Skip if participant has no ID
			}

			const { data: votes } = await votesQuery;
			const voteCount = votes?.length || 0;

			// If any participant hasn't used all their votes, return false
			if (voteCount < board.votes_per_user) {
				allVotesUsed = false;
				break;
			}
		}

		return NextResponse.json({
			allVotesUsed,
			votesPerUser: board.votes_per_user,
			participantCount: participants.length,
		});
	} catch (error) {
		reportError("Check voting status error:", error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			{ status: 500 },
		);
	}
}

// Auto-end voting phase endpoint
export async function POST(
	_request: Request,
	{ params }: { params: Promise<{ boardId: string }> },
) {
	try {
		const resolvedParams = await params;
		const { userId } = await auth();

		if (!userId) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		// Get board and verify ownership
		const { data: board } = await db
			.from("boards")
			.select("owner_id, phase")
			.eq("id", resolvedParams.boardId)
			.single();

		if (!board) {
			return NextResponse.json({ error: "Board not found" }, { status: 404 });
		}

		// Get the database user
		const { data: dbUser } = await db
			.from("users")
			.select("id")
			.eq("clerk_id", userId)
			.maybeSingle();

		if (!dbUser || dbUser.id !== board.owner_id) {
			return NextResponse.json(
				{ error: "Only the board owner can end voting" },
				{ status: 403 },
			);
		}

		// Only allow ending if in voting phase
		if (board.phase !== "voting") {
			return NextResponse.json(
				{ error: "Board is not in voting phase" },
				{ status: 400 },
			);
		}

		// Move to discussion phase
		const { error: updateError } = await db
			.from("boards")
			.update({
				phase: "discussion",
				phase_started_at: new Date().toISOString(),
				phase_ends_at: null, // Discussion phase has no timer
			})
			.eq("id", resolvedParams.boardId);

		if (updateError) {
			reportError("Error updating board phase:", updateError);
			return NextResponse.json({ error: updateError.message }, { status: 500 });
		}

		// Broadcast phase change
		await broadcastBoardEvent(resolvedParams.boardId, "phase_changed", {
			previousPhase: "voting",
			newPhase: "discussion",
		});

		return NextResponse.json({
			success: true,
			newPhase: "discussion",
		});
	} catch (error) {
		reportError("Auto-end voting error:", error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			{ status: 500 },
		);
	}
}
