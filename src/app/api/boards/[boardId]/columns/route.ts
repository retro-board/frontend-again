import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { supabaseAdmin } from "~/lib/supabase/admin";
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
		const { name, color, position } = body;

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
			.eq("id", resolvedParams.boardId)
			.eq("owner_id", dbUser.id)
			.single();

		if (!board) {
			return NextResponse.json(
				{ error: "Not authorized to modify this board" },
				{ status: 403 },
			);
		}

		// Create column
		const { data: column, error } = await supabaseAdmin
			.from("columns")
			.insert({
				board_id: resolvedParams.boardId,
				name,
				color,
				position,
			})
			.select()
			.single();

		if (error) {
			console.error("Error creating column:", error);
			return NextResponse.json({ error: error.message }, { status: 500 });
		}

		return NextResponse.json({ column });
	} catch (error) {
		console.error("Create column error:", error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			{ status: 500 },
		);
	}
}

export async function DELETE(
	request: Request,
	{ params }: { params: Promise<{ boardId: string }> },
) {
	try {
		const resolvedParams = await params;
		const { userId } = await auth();

		if (!userId) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const { searchParams } = new URL(request.url);
		const columnId = searchParams.get("columnId");

		if (!columnId) {
			return NextResponse.json(
				{ error: "Column ID required" },
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

		// Check if user is owner of this board
		const { data: board } = await supabaseAdmin
			.from("boards")
			.select("owner_id")
			.eq("id", resolvedParams.boardId)
			.eq("owner_id", dbUser.id)
			.single();

		if (!board) {
			return NextResponse.json(
				{ error: "Not authorized to modify this board" },
				{ status: 403 },
			);
		}

		// Check if column is an action column
		const { data: column } = await supabaseAdmin
			.from("columns")
			.select("is_action")
			.eq("id", columnId)
			.single();

		if (column?.is_action) {
			return NextResponse.json(
				{ error: "Cannot delete action column" },
				{ status: 400 },
			);
		}

		// Delete column
		const { error } = await supabaseAdmin
			.from("columns")
			.delete()
			.eq("id", columnId)
			.eq("board_id", resolvedParams.boardId);

		if (error) {
			console.error("Error deleting column:", error);
			return NextResponse.json({ error: error.message }, { status: 500 });
		}

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error("Delete column error:", error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			{ status: 500 },
		);
	}
}
