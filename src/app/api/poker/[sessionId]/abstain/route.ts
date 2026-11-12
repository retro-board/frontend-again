import { NextResponse } from "next/server";
import { reportError } from "~/lib/bugfixes";
import { db } from "~/lib/db";
import { authorizeLegacyPoker } from "~/lib/poker/legacy-authorization";

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ sessionId: string }> },
) {
	try {
		const resolvedParams = await params;
		const authorization = await authorizeLegacyPoker(
			resolvedParams.sessionId,
			false,
		);
		if (authorization.response) return authorization.response;
		const identity = authorization.identity;
		const body = await request.json();
		const { isAbstaining } = body;

		// Determine the user identifier
		let participantUserId: string | null = null;

		const anonymousUserId = identity.anonymous ? identity.user.id : undefined;
		participantUserId = identity.anonymous ? null : identity.user.id;

		if (!participantUserId && !anonymousUserId) {
			return NextResponse.json(
				{ error: "User identification required" },
				{ status: 401 },
			);
		}

		// Update abstention status
		if (participantUserId) {
			const { error } = await db
				.from("poker_participants")
				.update({ is_abstaining: isAbstaining })
				.eq("session_id", resolvedParams.sessionId)
				.eq("user_id", participantUserId);

			if (error) {
				reportError("Error updating abstention:", error);
				return NextResponse.json({ error: error.message }, { status: 500 });
			}
		} else {
			// For anonymous users, we'll track this in session state only
			// The channel message will handle updating client state
		}

		return NextResponse.json({ success: true, isAbstaining });
	} catch (error) {
		reportError("Abstain error:", error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			{ status: 500 },
		);
	}
}
