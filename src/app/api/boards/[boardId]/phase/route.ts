import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { env } from "~/env";
import type { BoardPhase } from "~/types/database";

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

const NEXT_PHASE: Record<BoardPhase, BoardPhase> = {
	setup: "creation",
	creation: "voting",
	voting: "discussion",
	discussion: "completed",
	completed: "completed",
};

export async function POST(
	request: Request,
	{ params }: { params: { boardId: string } },
) {
	try {
		const { userId } = await auth();

		if (!userId) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const body = await request.json();
		const { action } = body; // "start", "pause", or "advance"

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
			.eq("id", params.boardId)
			.single();

		if (!board) {
			return NextResponse.json({ error: "Board not found" }, { status: 404 });
		}

		if (board.owner_id !== dbUser.id) {
			return NextResponse.json(
				{ error: "Only board owners can manage phases" },
				{ status: 403 },
			);
		}

		let updateData: any = {};

		switch (action) {
			case "start": {
				// Start the timer for current phase
				const duration =
					board.phase === "creation"
						? board.creation_time_minutes
						: board.phase === "voting"
							? board.voting_time_minutes
							: 0;

				if (duration > 0) {
					const now = new Date();
					const endsAt = new Date(now.getTime() + duration * 60 * 1000);

					updateData = {
						phase_started_at: now.toISOString(),
						phase_ends_at: endsAt.toISOString(),
					};
				}
				break;
			}

			case "pause":
				// Pause the timer
				updateData = {
					phase_ends_at: null,
				};
				break;

			case "advance": {
				// Move to next phase
				const nextPhase = NEXT_PHASE[board.phase as BoardPhase];
				updateData = {
					phase: nextPhase,
					phase_started_at: new Date().toISOString(),
					phase_ends_at: null,
				};

				// If advancing to voting phase, unmask all cards
				if (nextPhase === "voting") {
					await supabaseAdmin
						.from("cards")
						.update({ is_masked: false })
						.in(
							"column_id",
							await supabaseAdmin
								.from("columns")
								.select("id")
								.eq("board_id", params.boardId)
								.then((res) => res.data?.map((col) => col.id) || []),
						);
				}
				break;
			}

			default:
				return NextResponse.json({ error: "Invalid action" }, { status: 400 });
		}

		// Update board
		const { data: updatedBoard, error } = await supabaseAdmin
			.from("boards")
			.update(updateData)
			.eq("id", params.boardId)
			.select()
			.single();

		if (error) {
			console.error("Error updating board phase:", error);
			return NextResponse.json({ error: error.message }, { status: 500 });
		}

		return NextResponse.json({ board: updatedBoard });
	} catch (error) {
		console.error("Phase management error:", error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			{ status: 500 },
		);
	}
}
