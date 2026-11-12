import { auth, currentUser } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { publicCard } from "~/lib/boards/card-privacy";
import { reportError } from "~/lib/bugfixes";
import { db } from "~/lib/db";

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
		let viewerId: string | undefined;

		if (userId) {
			// Get user from database using admin client
			let { data: dbUser } = await db
				.from("users")
				.select("id")
				.eq("clerk_id", userId)
				.maybeSingle();

			// If user doesn't exist, sync them from Clerk
			if (!dbUser) {
				const clerkUser = await currentUser();
				if (clerkUser) {
					const { data: newUser } = await db
						.from("users")
						.insert({
							clerk_id: userId,
							email: clerkUser.emailAddresses[0]?.emailAddress ?? "",
							name: clerkUser.fullName ?? clerkUser.username ?? "",
							avatar_url: clerkUser.imageUrl,
						})
						.select("id")
						.single();

					dbUser = newUser;
				}
			}

			if (!dbUser) {
				return NextResponse.json({ error: "User not found" }, { status: 404 });
			}

			viewerId = dbUser.id;

			// Check authorization using admin client
			const { data: participant } = await db
				.from("board_participants")
				.select("*")
				.eq("board_id", resolvedParams.boardId)
				.eq("user_id", dbUser.id)
				.maybeSingle();

			isAuthorized = !!participant;
		} else if (anonymousSessionId) {
			// Get anonymous user
			const { data: anonymousUser } = await db
				.from("anonymous_users")
				.select("id")
				.eq("session_id", anonymousSessionId)
				.maybeSingle();

			if (anonymousUser) {
				viewerId = anonymousUser.id;
				// Check if anonymous user is a participant
				const { data: participant } = await db
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

		// Fetch board using admin client
		const { data: board, error: boardError } = await db
			.from("boards")
			.select("*")
			.eq("id", resolvedParams.boardId)
			.single();

		if (boardError || !board) {
			return NextResponse.json({ error: "Board not found" }, { status: 404 });
		}

		// Fetch columns with cards (use admin for columns as they might not have RLS)
		const { data: columns, error: columnsError } = await db
			.from("columns")
			.select(`
        *,
        cards(
          *,
          author:users(*),
          anonymous_author:anonymous_users(id, display_name),
          items:card_items(*),
          votes:card_votes(*)
        )
      `)
			.eq("board_id", resolvedParams.boardId)
			.order("position");

		if (columnsError) {
			reportError("Error fetching columns:", columnsError);
			return NextResponse.json(
				{ error: columnsError.message },
				{ status: 500 },
			);
		}

		// Sort cards within each column
		const sortedColumns = (columns || []).map((column) => ({
			...column,
			cards: column.cards
				.map((card: import("~/types/database").Card) =>
					publicCard(card, viewerId, !userId),
				)
				.sort(
					(a: { position: number }, b: { position: number }) =>
						a.position - b.position,
				),
		}));

		return NextResponse.json({ board, columns: sortedColumns });
	} catch (error) {
		reportError("Get board error:", error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			{ status: 500 },
		);
	}
}
