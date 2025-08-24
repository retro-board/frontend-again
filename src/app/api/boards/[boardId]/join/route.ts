import { auth, currentUser } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "~/lib/supabase/admin";

export async function POST(
	_request: Request,
	{ params }: { params: Promise<{ boardId: string }> },
) {
	try {
		const resolvedParams = await params;
		const { userId } = await auth();
		const cookieStore = await cookies();
		const anonymousSessionId = cookieStore.get("anonymous_session_id")?.value;

		// Must be either logged in or have anonymous session
		if (!userId && !anonymousSessionId) {
			return NextResponse.json(
				{ error: "Authentication required" },
				{ status: 401 },
			);
		}

		// Check if board exists, is active, and not in setup phase
		const { data: board } = await supabaseAdmin
			.from("boards")
			.select("id, phase, owner_id")
			.eq("id", resolvedParams.boardId)
			.eq("is_active", true)
			.maybeSingle();

		if (!board) {
			return NextResponse.json(
				{ error: "Board not found or inactive" },
				{ status: 404 },
			);
		}

		// Check if board is in setup phase
		if (board.phase === "setup") {
			// Only the owner can join during setup phase
			if (userId) {
				const { data: dbUser } = await supabaseAdmin
					.from("users")
					.select("id")
					.eq("clerk_id", userId)
					.maybeSingle();

				if (!dbUser || dbUser.id !== board.owner_id) {
					return NextResponse.json(
						{
							error:
								"Board is still being set up. Please wait for the owner to complete setup.",
						},
						{ status: 403 },
					);
				}
				// Owner can proceed to join (though they should already be a participant)
			} else {
				// Anonymous users cannot join during setup
				return NextResponse.json(
					{
						error:
							"Board is still being set up. Please wait for the owner to complete setup.",
					},
					{ status: 403 },
				);
			}
		}

		if (userId) {
			// Handle logged-in user
			let { data: dbUser } = await supabaseAdmin
				.from("users")
				.select("id")
				.eq("clerk_id", userId)
				.maybeSingle();

			// If user doesn't exist, sync them from Clerk
			if (!dbUser) {
				const clerkUser = await currentUser();
				if (clerkUser) {
					const { data: newUser } = await supabaseAdmin
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

			// Check if already participant
			const { data: existingParticipant } = await supabaseAdmin
				.from("board_participants")
				.select("id")
				.eq("board_id", resolvedParams.boardId)
				.eq("user_id", dbUser.id)
				.maybeSingle();

			if (!existingParticipant) {
				// Add as participant
				const { error } = await supabaseAdmin
					.from("board_participants")
					.insert({
						board_id: resolvedParams.boardId,
						user_id: dbUser.id,
						role: "participant",
					});

				if (error) {
					console.error("Error adding participant:", error);
					return NextResponse.json({ error: error.message }, { status: 500 });
				}
			}
		} else if (anonymousSessionId) {
			// Handle anonymous user
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

			// Check if already participant
			const { data: existingParticipant } = await supabaseAdmin
				.from("board_anonymous_participants")
				.select("id")
				.eq("board_id", resolvedParams.boardId)
				.eq("anonymous_user_id", anonymousUser.id)
				.maybeSingle();

			if (!existingParticipant) {
				// Add as anonymous participant
				const { error } = await supabaseAdmin
					.from("board_anonymous_participants")
					.insert({
						board_id: resolvedParams.boardId,
						anonymous_user_id: anonymousUser.id,
					});

				if (error) {
					console.error("Error adding anonymous participant:", error);
					return NextResponse.json({ error: error.message }, { status: 500 });
				}
			}
		}

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error("Join board error:", error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			{ status: 500 },
		);
	}
}
