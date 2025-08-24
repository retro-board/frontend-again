import { auth, currentUser } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "~/lib/supabase/admin";

export async function POST(
	request: Request,
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

		const body = await request.json();
		const { column_id, content, position, is_anonymous } = body;

		let authorId = "";
		let isAuthorized = false;

		if (userId) {
			// Get user from database
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

			authorId = dbUser.id;

			// Check if user is participant of this board
			const { data: participant } = await supabaseAdmin
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
				.eq("board_id", resolvedParams.boardId)
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

		// During setup phase, only action items can be added (even by owner)
		if (column.board.phase === "setup" && !column.is_action) {
			return NextResponse.json(
				{ error: "During setup phase, only action items can be added" },
				{ status: 403 },
			);
		}

		// During join phase, no cards can be added
		if (column.board.phase === "join") {
			return NextResponse.json(
				{
					error:
						"Cards cannot be added during the join phase. Please wait for all participants to join.",
				},
				{ status: 403 },
			);
		}

		// Create card
		const cardData = {
			column_id,
			content,
			position,
			is_anonymous: is_anonymous || !!anonymousSessionId,
			is_masked: column.board.phase === "creation", // Mask cards during creation phase
			author_id: undefined as string | undefined,
			anonymous_author_id: undefined as string | undefined,
		};

		// Set the appropriate author field based on user type
		if (userId) {
			cardData.author_id = authorId;
		} else if (anonymousSessionId) {
			cardData.anonymous_author_id = authorId;
		}

		const { data: card, error } = await supabaseAdmin
			.from("cards")
			.insert(cardData)
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
		const cookieStore = await cookies();
		const anonymousSessionId = cookieStore.get("anonymous_session_id")?.value;

		if (!userId && !anonymousSessionId) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const body = await request.json();
		const { cardId, content, column_id, position } = body;

		let authorId: string | null = null;

		if (userId) {
			// Get user from database
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
			authorId = dbUser.id;
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
		}

		// Build update object
		const updateData: {
			updated_at: string;
			content?: string;
			column_id?: string;
			position?: number;
		} = { updated_at: new Date().toISOString() };
		if (content !== undefined) updateData.content = content;
		if (column_id !== undefined) updateData.column_id = column_id;
		if (position !== undefined) updateData.position = position;

		// Update card (only author can update content)
		let query = supabaseAdmin.from("cards").update(updateData).eq("id", cardId);

		// If updating content, ensure user is author
		if (content !== undefined) {
			if (userId) {
				query = query.eq("author_id", authorId);
			} else if (anonymousSessionId) {
				query = query.eq("anonymous_author_id", authorId);
			}
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
		const cookieStore = await cookies();
		const anonymousSessionId = cookieStore.get("anonymous_session_id")?.value;

		if (!userId && !anonymousSessionId) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const { searchParams } = new URL(request.url);
		const cardId = searchParams.get("cardId");

		if (!cardId) {
			return NextResponse.json({ error: "Card ID required" }, { status: 400 });
		}

		let deleteQuery = supabaseAdmin.from("cards").delete().eq("id", cardId);

		if (userId) {
			// Get user from database
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

			// Delete card (only author can delete)
			deleteQuery = deleteQuery.eq("author_id", dbUser.id);
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

			// Delete card (only anonymous author can delete)
			deleteQuery = deleteQuery.eq("anonymous_author_id", anonymousUser.id);
		}

		const { error } = await deleteQuery;

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
