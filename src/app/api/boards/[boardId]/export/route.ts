import { auth, currentUser } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import {
	createBoardExportFilename,
	createBoardMarkdownExport,
} from "~/lib/boards/export-markdown";
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
			return Response.json({ error: "Unauthorized" }, { status: 401 });
		}

		let isAuthorized = false;

		if (userId) {
			let { data: dbUser } = await db
				.from("users")
				.select("id")
				.eq("clerk_id", userId)
				.maybeSingle();

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
				return Response.json({ error: "User not found" }, { status: 404 });
			}

			const { data: participant } = await db
				.from("board_participants")
				.select("id")
				.eq("board_id", resolvedParams.boardId)
				.eq("user_id", dbUser.id)
				.maybeSingle();

			isAuthorized = !!participant;
		} else if (anonymousSessionId) {
			const { data: anonymousUser } = await db
				.from("anonymous_users")
				.select("id")
				.eq("session_id", anonymousSessionId)
				.maybeSingle();

			if (anonymousUser) {
				const { data: participant } = await db
					.from("board_anonymous_participants")
					.select("id")
					.eq("board_id", resolvedParams.boardId)
					.eq("anonymous_user_id", anonymousUser.id)
					.maybeSingle();

				isAuthorized = !!participant;
			}
		}

		if (!isAuthorized) {
			return Response.json(
				{ error: "Not authorized to export this board" },
				{ status: 403 },
			);
		}

		const { data: board, error: boardError } = await db
			.from("boards")
			.select("*")
			.eq("id", resolvedParams.boardId)
			.single();

		if (boardError || !board) {
			return Response.json({ error: "Board not found" }, { status: 404 });
		}

		if (board.phase !== "completed") {
			return Response.json(
				{ error: "Boards can only be exported after completion" },
				{ status: 409 },
			);
		}

		const { data: columns, error: columnsError } = await db
			.from("columns")
			.select(`
				*,
				cards(
					*,
					author:users(name, email),
					anonymous_author:anonymous_users(display_name),
					votes:card_votes(id, user_id, anonymous_user_id)
				)
			`)
			.eq("board_id", resolvedParams.boardId)
			.order("position");

		if (columnsError) {
			reportError("Error fetching export columns:", columnsError);
			return Response.json({ error: columnsError.message }, { status: 500 });
		}

		const markdown = createBoardMarkdownExport({
			board: board as Parameters<typeof createBoardMarkdownExport>[0]["board"],
			columns: (columns || []).map((column) => ({
				...column,
				cards: [...column.cards].sort(
					(a: { position: number }, b: { position: number }) =>
						a.position - b.position,
				),
			})) as Parameters<typeof createBoardMarkdownExport>[0]["columns"],
		});

		return new Response(markdown, {
			status: 200,
			headers: {
				"Content-Type": "text/markdown; charset=utf-8",
				"Content-Disposition": `attachment; filename="${createBoardExportFilename(board.name)}"`,
			},
		});
	} catch (error) {
		reportError("Board export error:", error);
		return Response.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			{ status: 500 },
		);
	}
}
