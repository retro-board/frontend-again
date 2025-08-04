import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { env } from "~/env";

// Create admin client with service role key
const supabaseAdmin = createClient(
	env.NEXT_PUBLIC_SUPABASE_URL,
	env.SUPABASE_SERVICE_ROLE_KEY,
	{
		auth: {
			autoRefreshToken: false,
			persistSession: false,
		},
	},
);

export async function GET(
	request: Request,
	{ params }: { params: { boardId: string } },
) {
	try {
		const { userId } = await auth();
		const cookieStore = cookies();
		const anonymousSessionId = cookieStore.get("anonymous_session_id")?.value;

		if (!userId && !anonymousSessionId) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

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

			// Check if user is a participant of this board
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

			if (anonymousUser) {
				// Check if anonymous user is a participant
				const { data: participant } = await supabaseAdmin
					.from("board_anonymous_participants")
					.select("*")
					.eq("board_id", params.boardId)
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

		// Fetch board
		const { data: board, error: boardError } = await supabaseAdmin
			.from("boards")
			.select("*")
			.eq("id", params.boardId)
			.single();

		if (boardError || !board) {
			return NextResponse.json({ error: "Board not found" }, { status: 404 });
		}

		// Fetch columns with cards
		const { data: columns, error: columnsError } = await supabaseAdmin
			.from("columns")
			.select(`
        *,
        cards(
          *,
          votes:card_votes(*)
        )
      `)
			.eq("board_id", params.boardId)
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
			cards: column.cards.sort((a: any, b: any) => a.position - b.position),
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
