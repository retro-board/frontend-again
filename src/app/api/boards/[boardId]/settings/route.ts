import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { reportError } from "~/lib/bugfixes";

import { db } from "~/lib/db";
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
		const {
			name,
			description,
			creation_time_minutes,
			voting_time_minutes,
			votes_per_user,
		} = body;

		// Get user from database
		const { data: dbUser } = await db
			.from("users")
			.select("id")
			.eq("clerk_id", userId)
			.maybeSingle();

		if (!dbUser) {
			return NextResponse.json({ error: "User not found" }, { status: 404 });
		}

		// Check if user is owner of this board
		const { data: board } = await db
			.from("boards")
			.select("owner_id")
			.eq("id", resolvedParams.boardId)
			.single();

		if (!board) {
			return NextResponse.json({ error: "Board not found" }, { status: 404 });
		}

		if (board.owner_id !== dbUser.id) {
			return NextResponse.json(
				{ error: "Only board owners can update settings" },
				{ status: 403 },
			);
		}

		// Update board
		const updateData: {
			updated_at: string;
			name?: string;
			description?: string;
			creation_time_minutes?: number;
			voting_time_minutes?: number;
			votes_per_user?: number;
		} = {
			updated_at: new Date().toISOString(),
		};

		if (name !== undefined) updateData.name = name;
		if (description !== undefined) updateData.description = description;
		if (creation_time_minutes !== undefined)
			updateData.creation_time_minutes = creation_time_minutes;
		if (voting_time_minutes !== undefined)
			updateData.voting_time_minutes = voting_time_minutes;
		if (votes_per_user !== undefined)
			updateData.votes_per_user = votes_per_user;

		const { data: updatedBoard, error } = await db
			.from("boards")
			.update(updateData)
			.eq("id", resolvedParams.boardId)
			.select()
			.single();

		if (error) {
			reportError("Error updating board:", error);
			return NextResponse.json({ error: error.message }, { status: 500 });
		}

		return NextResponse.json({ board: updatedBoard });
	} catch (error) {
		reportError("Update board error:", error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			{ status: 500 },
		);
	}
}

export async function DELETE(
	_request: Request,
	{ params }: { params: Promise<{ boardId: string }> },
) {
	try {
		const resolvedParams = await params;
		const { userId } = await auth();

		if (!userId) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

		// Check if user is owner of this board
		const { data: board } = await db
			.from("boards")
			.select("owner_id")
			.eq("id", resolvedParams.boardId)
			.single();

		if (!board) {
			return NextResponse.json({ error: "Board not found" }, { status: 404 });
		}

		if (board.owner_id !== dbUser.id) {
			return NextResponse.json(
				{ error: "Only board owners can delete boards" },
				{ status: 403 },
			);
		}

		// Delete board (cascades to columns, cards, votes, etc.)
		const { error } = await db
			.from("boards")
			.delete()
			.eq("id", resolvedParams.boardId);

		if (error) {
			reportError("Error deleting board:", error);
			return NextResponse.json({ error: error.message }, { status: 500 });
		}

		return NextResponse.json({ success: true });
	} catch (error) {
		reportError("Delete board error:", error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			{ status: 500 },
		);
	}
}
