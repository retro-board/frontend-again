import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "~/lib/supabase/admin";
import {
	broadcastToBoard,
	type HighlightCardPayload,
} from "~/lib/supabase/channels-server";

export async function POST(
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
		const { cardId, duration } = body; // duration in seconds for discussion timer

		if (!cardId) {
			return NextResponse.json(
				{ error: "Card ID is required" },
				{ status: 400 },
			);
		}

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
				{ error: "Only board owners can highlight cards" },
				{ status: 403 },
			);
		}

		// Check phase - only allow highlighting during discussion phase
		if (board.phase !== "discussion") {
			return NextResponse.json(
				{ error: "Cards can only be highlighted during the discussion phase" },
				{ status: 403 },
			);
		}

		// Verify card exists and belongs to this board
		const { data: card } = await supabaseAdmin
			.from("cards")
			.select(`
				*,
				column:columns(board_id)
			`)
			.eq("id", cardId)
			.single();

		if (!card || card.column.board_id !== resolvedParams.boardId) {
			return NextResponse.json(
				{ error: "Card not found or doesn't belong to this board" },
				{ status: 404 },
			);
		}

		// Optionally store the highlighted card in the board record
		const { error: updateError } = await supabaseAdmin
			.from("boards")
			.update({
				highlighted_card_id: cardId,
				highlighted_at: new Date().toISOString(),
			})
			.eq("id", resolvedParams.boardId);

		if (updateError) {
			console.error("Error updating board:", updateError);
			// Non-fatal, continue with broadcast
		}

		// Broadcast card highlighted event
		const highlightPayload: HighlightCardPayload = {
			cardId,
			duration: duration || 60, // Default to 60 seconds if not specified
		};
		await broadcastToBoard(
			resolvedParams.boardId,
			"card_highlighted",
			highlightPayload,
		);

		return NextResponse.json({
			success: true,
			cardId,
			duration: highlightPayload.duration,
		});
	} catch (error) {
		console.error("Highlight card error:", error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			{ status: 500 },
		);
	}
}