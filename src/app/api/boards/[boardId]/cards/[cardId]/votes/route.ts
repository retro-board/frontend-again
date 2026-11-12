import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { toggleBoardVote } from "~/lib/boards/toggle-vote";
import { reportError } from "~/lib/bugfixes";
import { db } from "~/lib/db";
import { broadcastBoardEvent } from "~/lib/realtime/broadcast";

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
			const { data: dbUser } = await db
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
			const { data: anonymousUser } = await db
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

		const result = await toggleBoardVote(
			resolvedParams.boardId,
			resolvedParams.cardId,
			voterId,
			isAnonymous,
		);
		if ("error" in result)
			return NextResponse.json(
				{ error: result.error },
				{ status: result.status },
			);
		await broadcastBoardEvent(
			resolvedParams.boardId,
			result.voted ? "vote_added" : "vote_removed",
			{ cardId: resolvedParams.cardId },
		);
		return NextResponse.json(result);
	} catch (error) {
		reportError("Vote error:", error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			{ status: 500 },
		);
	}
}
