import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { supabaseAdmin } from "~/lib/supabase/admin";
export async function PATCH(
	request: Request,
	{ params }: { params: { boardId: string } },
) {
	try {
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
		const { data: dbUser } = await supabaseAdmin
			.from("users")
			.select("id")
			.eq("clerk_id", userId)
			.maybeSingle();

		if (!dbUser) {
			return NextResponse.json({ error: "User not found" }, { status: 404 });
		}

		// Check if user is owner of this board
		const { data: board } = await supabaseAdmin
			.from("boards")
			.select("owner_id")
			.eq("id", params.boardId)
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

		const { data: updatedBoard, error } = await supabaseAdmin
			.from("boards")
			.update(updateData)
			.eq("id", params.boardId)
			.select()
			.single();

		if (error) {
			console.error("Error updating board:", error);
			return NextResponse.json({ error: error.message }, { status: 500 });
		}

		return NextResponse.json({ board: updatedBoard });
	} catch (error) {
		console.error("Update board error:", error);
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
	{ params }: { params: { boardId: string } },
) {
	try {
		const { userId } = await auth();

		if (!userId) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

		// Check if user is owner of this board
		const { data: board } = await supabaseAdmin
			.from("boards")
			.select("owner_id")
			.eq("id", params.boardId)
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
		const { error } = await supabaseAdmin
			.from("boards")
			.delete()
			.eq("id", params.boardId);

		if (error) {
			console.error("Error deleting board:", error);
			return NextResponse.json({ error: error.message }, { status: 500 });
		}

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error("Delete board error:", error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			{ status: 500 },
		);
	}
}
