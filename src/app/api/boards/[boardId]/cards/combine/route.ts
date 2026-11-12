import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { combineCards } from "~/lib/boards/combine-cards";
import { reportError } from "~/lib/bugfixes";
import { db } from "~/lib/db";
import {
	broadcastToBoard,
	type CombineCardsPayload,
} from "~/lib/realtime/channels-server";

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
		const { data: dbUser } = await db
			.from("users")
			.select("id")
			.eq("clerk_id", userId)
			.maybeSingle();

		if (!dbUser) {
			return NextResponse.json({ error: "User not found" }, { status: 404 });
		}

		// Get board and check ownership
		const { data: board } = await db
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

		const result = await combineCards(
			resolvedParams.boardId,
			dbUser.id,
			sourceCardIds,
			targetCardId,
			newContent,
		);
		if ("error" in result)
			return NextResponse.json(
				{ error: result.error },
				{ status: result.status },
			);
		const finalCardId = result.cardId;
		const finalContent = result.content;

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
		reportError("Combine cards error:", error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			{ status: 500 },
		);
	}
}
