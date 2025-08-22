import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "~/lib/supabase/admin";
import { createAuthenticatedSupabaseClient } from "~/lib/supabase/server";

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

		let isAuthorized = false;
		let supabase = supabaseAdmin; // Default to admin for anonymous users

		if (userId) {
			// Use authenticated client for logged-in users
			supabase = await createAuthenticatedSupabaseClient();

			// Get user from database
			const { data: dbUser } = await supabase
				.from("users")
				.select("id")
				.eq("clerk_id", userId)
				.maybeSingle();

			if (!dbUser) {
				return NextResponse.json({ error: "User not found" }, { status: 404 });
			}

			// RLS will handle authorization for board_participants
			const { data: participant } = await supabase
				.from("board_participants")
				.select("*")
				.eq("board_id", resolvedParams.boardId)
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

			if (anonymousUser) {
				// Check if anonymous user is a participant
				const { data: participant } = await supabaseAdmin
					.from("board_anonymous_participants")
					.select("*")
					.eq("board_id", resolvedParams.boardId)
					.eq("anonymous_user_id", anonymousUser.id)
					.maybeSingle();

				isAuthorized = !!participant;
			}
		}

		if (!isAuthorized) {
			return NextResponse.json(
				{ error: "Not authorized to view this board" },
				{ status: 403 },
			);
		}

		// Fetch board (RLS will handle permissions for authenticated users)
		const { data: board, error: boardError } = await supabase
			.from("boards")
			.select("*")
			.eq("id", resolvedParams.boardId)
			.single();

		if (boardError || !board) {
			return NextResponse.json({ error: "Board not found" }, { status: 404 });
		}

		// Fetch columns with cards (use admin for columns as they might not have RLS)
		const { data: columns, error: columnsError } = await supabaseAdmin
			.from("columns")
			.select(`
        *,
        cards(
          *,
          author:users(*),
          anonymous_author:anonymous_users(*),
          votes:card_votes(*)
        )
      `)
			.eq("board_id", resolvedParams.boardId)
			.order("position");

		if (columnsError) {
			console.error("Error fetching columns:", columnsError);
			return NextResponse.json(
				{ error: columnsError.message },
				{ status: 500 },
			);
		}

		// Sort cards within each column
		const sortedColumns = (columns || []).map((column) => ({
			...column,
			cards: column.cards.sort(
				(a: { position: number }, b: { position: number }) =>
					a.position - b.position,
			),
		}));

		return NextResponse.json({ board, columns: sortedColumns });
	} catch (error) {
		console.error("Get board error:", error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			{ status: 500 },
		);
	}
}
