import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "~/lib/supabase/admin";

export async function POST(
	request: Request,
	{ params }: { params: { boardId: string } },
) {
	try {
		const { userId } = await auth();
		const cookieStore = await cookies();
		const anonymousSessionId = cookieStore.get("anonymous_session_id")?.value;

		if (!userId && !anonymousSessionId) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const body = await request.json();
		const { column_id, content, position, is_anonymous } = body;

		let authorId = "";
		let isAuthorized = false;

		if (userId) {
			// Get user from database
			const { data: dbUser } = await supabaseAdmin
				.from("users")
				.select("id")
				.eq("clerk_id", userId)
				.maybeSingle();

			if (!dbUser) {
				return NextResponse.json({ error: "User not found" }, { status: 404 });
			}

			authorId = dbUser.id;

			// Check if user is participant of this board
			const { data: participant } = await supabaseAdmin
				.from("board_participants")
				.select("*")
				.eq("board_id", params.boardId)
				.eq("user_id", dbUser.id)
				.maybeSingle();

			isAuthorized = !!participant;
		} else if (anonymousSessionId) {
			// Get anonymous user
			const { data: anonymousUser } = await supabaseAdmin
				.from("anonymous_users")
				.select("id")
				.eq("session_id", anonymousSessionId)
				.maybeSingle();

			if (!anonymousUser) {
				return NextResponse.json(
					{ error: "Anonymous user not found" },
					{ status: 404 },
				);
			}

			authorId = anonymousUser.id;

			// Check if anonymous user is participant
			const { data: participant } = await supabaseAdmin
				.from("board_anonymous_participants")
				.select("*")
				.eq("board_id", params.boardId)
				.eq("anonymous_user_id", anonymousUser.id)
				.maybeSingle();

			isAuthorized = !!participant;
		}

		if (!isAuthorized) {
			return NextResponse.json(
				{ error: "Not authorized to add cards to this board" },
				{ status: 403 },
			);
		}

		// Check if column exists and is not an action column (unless board owner)
		const { data: column } = await supabaseAdmin
			.from("columns")
			.select("*, board:boards(*)")
			.eq("id", column_id)
			.single();

		if (!column) {
			return NextResponse.json({ error: "Column not found" }, { status: 404 });
		}

		// Non-owners can't add to action columns
		if (column.is_action && column.board.owner_id !== authorId) {
			return NextResponse.json(
				{ error: "Only board owners can add cards to action columns" },
				{ status: 403 },
			);
		}

		// Create card
		const { data: card, error } = await supabaseAdmin
			.from("cards")
			.insert({
				column_id,
				content,
				author_id: authorId,
				position,
				is_anonymous: is_anonymous || !!anonymousSessionId,
				is_masked: column.board.phase === "creation", // Mask cards during creation phase
			})
			.select()
			.single();

		if (error) {
			console.error("Error creating card:", error);
			return NextResponse.json({ error: error.message }, { status: 500 });
		}

		return NextResponse.json({ card });
	} catch (error) {
		console.error("Create card error:", error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			{ status: 500 },
		);
	}
}

export async function PATCH(request: Request) {
	try {
		const { userId } = await auth();

		if (!userId) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const body = await request.json();
		const { cardId, content, column_id, position } = body;

		// Get user from database
		const { data: dbUser } = await supabaseAdmin
			.from("users")
			.select("id")
			.eq("clerk_id", userId)
			.maybeSingle();

		if (!dbUser) {
			return NextResponse.json({ error: "User not found" }, { status: 404 });
		}

		// Build update object
		// biome-ignore lint/suspicious/noExplicitAny: hmm
		const updateData: any = { updated_at: new Date().toISOString() };
		if (content !== undefined) updateData.content = content;
		if (column_id !== undefined) updateData.column_id = column_id;
		if (position !== undefined) updateData.position = position;

		// Update card (only author can update content)
		const query = supabaseAdmin
			.from("cards")
			.update(updateData)
			.eq("id", cardId);

		// If updating content, ensure user is author
		if (content !== undefined) {
			query.eq("author_id", dbUser.id);
		}

		const { data: card, error } = await query.select().single();

		if (error) {
			console.error("Error updating card:", error);
			return NextResponse.json({ error: error.message }, { status: 500 });
		}

		return NextResponse.json({ card });
	} catch (error) {
		console.error("Update card error:", error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			{ status: 500 },
		);
	}
}

export async function DELETE(request: Request) {
	try {
		const { userId } = await auth();

		if (!userId) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const { searchParams } = new URL(request.url);
		const cardId = searchParams.get("cardId");

		if (!cardId) {
			return NextResponse.json({ error: "Card ID required" }, { status: 400 });
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

		// Delete card (only author can delete)
		const { error } = await supabaseAdmin
			.from("cards")
			.delete()
			.eq("id", cardId)
			.eq("author_id", dbUser.id);

		if (error) {
			console.error("Error deleting card:", error);
			return NextResponse.json({ error: error.message }, { status: 500 });
		}

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error("Delete card error:", error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			{ status: 500 },
		);
	}
}
