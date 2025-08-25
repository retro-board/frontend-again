import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "~/lib/supabase/admin";
import {
	broadcastToBoard,
	type CombineCardsPayload,
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
		const { sourceCardIds, targetCardId, newContent } = body;

		if (
			!sourceCardIds ||
			!Array.isArray(sourceCardIds) ||
			sourceCardIds.length === 0
		) {
			return NextResponse.json(
				{ error: "Source card IDs are required" },
				{ status: 400 },
			);
		}

		if (!targetCardId && !newContent) {
			return NextResponse.json(
				{ error: "Either target card ID or new content is required" },
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
				{ error: "Only board owners can combine cards" },
				{ status: 403 },
			);
		}

		// Check phase - only allow combining during reveal phase
		if (board.phase !== "reveal") {
			return NextResponse.json(
				{ error: "Cards can only be combined during the reveal phase" },
				{ status: 403 },
			);
		}

		// Get source cards
		const { data: sourceCards } = await supabaseAdmin
			.from("cards")
			.select("*, column:columns(*)")
			.in("id", sourceCardIds);

		if (!sourceCards || sourceCards.length !== sourceCardIds.length) {
			return NextResponse.json(
				{ error: "One or more source cards not found" },
				{ status: 404 },
			);
		}

		// Verify all cards are from the same board
		const columnIds = sourceCards.map((card) => card.column_id);
		const { data: columns } = await supabaseAdmin
			.from("columns")
			.select("board_id")
			.in("id", columnIds);

		const boardIds = new Set(columns?.map((col) => col.board_id));
		if (boardIds.size !== 1 || !boardIds.has(resolvedParams.boardId)) {
			return NextResponse.json(
				{ error: "All cards must be from the same board" },
				{ status: 400 },
			);
		}

		let finalCardId = targetCardId;
		let finalContent = newContent;

		if (targetCardId) {
			// Update existing target card with combined content
			if (!finalContent) {
				// Auto-generate combined content
				finalContent = sourceCards.map((card) => card.content).join("\n---\n");
			}

			const { error: updateError } = await supabaseAdmin
				.from("cards")
				.update({
					content: finalContent,
					updated_at: new Date().toISOString(),
				})
				.eq("id", targetCardId);

			if (updateError) {
				console.error("Error updating target card:", updateError);
				return NextResponse.json(
					{ error: updateError.message },
					{ status: 500 },
				);
			}
		} else {
			// Create new card with combined content
			const firstCard = sourceCards[0];

			const { data: newCard, error: createError } = await supabaseAdmin
				.from("cards")
				.insert({
					column_id: firstCard.column_id,
					content: finalContent,
					author_id: dbUser.id,
					position: firstCard.position,
					is_anonymous: false,
					is_masked: false,
				})
				.select()
				.single();

			if (createError) {
				console.error("Error creating combined card:", createError);
				return NextResponse.json(
					{ error: createError.message },
					{ status: 500 },
				);
			}

			finalCardId = newCard.id;
		}

		// Delete source cards (except target if it was one of them)
		const cardsToDelete = sourceCardIds.filter((id) => id !== targetCardId);
		if (cardsToDelete.length > 0) {
			const { error: deleteError } = await supabaseAdmin
				.from("cards")
				.delete()
				.in("id", cardsToDelete);

			if (deleteError) {
				console.error("Error deleting source cards:", deleteError);
				// Non-fatal, continue
			}
		}

		// Broadcast cards combined event
		const combinePayload: CombineCardsPayload = {
			sourceCardIds,
			targetCardId: finalCardId,
			newContent: finalContent,
		};
		await broadcastToBoard(
			resolvedParams.boardId,
			"cards_combined",
			combinePayload,
		);

		return NextResponse.json({
			success: true,
			cardId: finalCardId,
			content: finalContent,
		});
	} catch (error) {
		console.error("Combine cards error:", error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			{ status: 500 },
		);
	}
}