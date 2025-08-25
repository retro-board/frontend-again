import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "~/lib/supabase/admin";
import { broadcastBoardEvent } from "~/lib/supabase/broadcast";

export async function POST(
	_request: Request,
	{ params }: { params: Promise<{ boardId: string; cardId: string }> },
) {
	try {
		const resolvedParams = await params;
		const { userId } = await auth();
		const cookieStore = await cookies();
		const anonymousSessionId = cookieStore.get("anonymous_session_id")?.value;

		if (!userId && !anonymousSessionId) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		let voterId: string;
		let isAnonymous = false;

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

			voterId = dbUser.id;
		} else {
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

			voterId = anonymousUser.id;
			isAnonymous = true;
		}

		// Get board details
		const { data: board } = await supabaseAdmin
			.from("boards")
			.select("votes_per_user, phase")
			.eq("id", resolvedParams.boardId)
			.single();

		if (!board) {
			return NextResponse.json({ error: "Board not found" }, { status: 404 });
		}

		// Check if in voting phase
		if (board.phase !== "voting") {
			return NextResponse.json(
				{ error: "Voting is only allowed during the voting phase" },
				{ status: 400 },
			);
		}

		// Check if card is in an action column (cannot vote on action items)
		const { data: card } = await supabaseAdmin
			.from("cards")
			.select(`
				id,
				column_id,
				columns!inner(
					id,
					is_action
				)
			`)
			.eq("id", resolvedParams.cardId)
			.single();

		if (!card) {
			return NextResponse.json({ error: "Card not found" }, { status: 404 });
		}

		// Check if the column is an action column
		// biome-ignore lint/suspicious/noExplicitAny: Supabase nested query result
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const cardData = card as any;
		if (cardData.columns?.is_action) {
			return NextResponse.json(
				{ error: "Cannot vote on action items" },
				{ status: 400 },
			);
		}

		// Check existing vote
		const existingVoteQuery = supabaseAdmin
			.from("card_votes")
			.select("id")
			.eq("card_id", resolvedParams.cardId);

		if (isAnonymous) {
			existingVoteQuery.eq("anonymous_user_id", voterId);
		} else {
			existingVoteQuery.eq("user_id", voterId);
		}

		const { data: existingVote } = await existingVoteQuery.maybeSingle();

		if (existingVote) {
			// Remove vote
			const { error } = await supabaseAdmin
				.from("card_votes")
				.delete()
				.eq("id", existingVote.id);

			if (error) {
				console.error("Error removing vote:", error);
				return NextResponse.json({ error: error.message }, { status: 500 });
			}

			// Broadcast vote removed event
			await broadcastBoardEvent(resolvedParams.boardId, "vote_removed", {
				cardId: resolvedParams.cardId,
			});

			return NextResponse.json({ voted: false });
		}
		// Count user's votes for this board
		const votesCountQuery = supabaseAdmin
			.from("card_votes")
			.select("card_id")
			.in(
				"card_id",
				await supabaseAdmin
					.from("cards")
					.select("id")
					.in(
						"column_id",
						await supabaseAdmin
							.from("columns")
							.select("id")
							.eq("board_id", resolvedParams.boardId)
							.then((res) => res.data?.map((col) => col.id) || []),
					)
					.then((res) => res.data?.map((card) => card.id) || []),
			);

		if (isAnonymous) {
			votesCountQuery.eq("anonymous_user_id", voterId);
		} else {
			votesCountQuery.eq("user_id", voterId);
		}

		const { data: userVotes } = await votesCountQuery;
		const voteCount = userVotes?.length || 0;

		if (voteCount >= board.votes_per_user) {
			return NextResponse.json(
				{
					error: `You can only vote on ${board.votes_per_user} items`,
				},
				{ status: 400 },
			);
		}

		// Add vote
		const voteData: {
			card_id: string;
			user_id?: string;
			anonymous_user_id?: string;
		} = {
			card_id: resolvedParams.cardId,
		};

		if (isAnonymous) {
			voteData.anonymous_user_id = voterId;
		} else {
			voteData.user_id = voterId;
		}

		const { error } = await supabaseAdmin.from("card_votes").insert(voteData);

		if (error) {
			console.error("Error adding vote:", error);
			return NextResponse.json({ error: error.message }, { status: 500 });
		}

		// Broadcast vote added event
		await broadcastBoardEvent(resolvedParams.boardId, "vote_added", {
			cardId: resolvedParams.cardId,
		});

		return NextResponse.json({
			voted: true,
			remainingVotes: board.votes_per_user - voteCount - 1,
		});
	} catch (error) {
		console.error("Vote error:", error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			{ status: 500 },
		);
	}
}
