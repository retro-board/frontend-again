import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { supabaseAdmin } from "~/lib/supabase/admin";

export async function GET() {
	try {
		const { userId } = await auth();

		if (!userId) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		// Get user from database
		const { data: dbUser } = await supabaseAdmin
			.from("users")
			.select("id")
			.eq("clerk_id", userId)
			.maybeSingle();

		if (!dbUser) {
			return NextResponse.json({ error: "User not found" }, { status: 404 });
		}

		// Fetch boards where user is owner
		const { data: ownedBoards, error: ownedError } = await supabaseAdmin
			.from("boards")
			.select(`
				*,
				participants:board_participants(
					*,
					user:users(*)
				)
			`)
			.eq("owner_id", dbUser.id)
			.eq("is_active", true)
			.order("created_at", { ascending: false });

		if (ownedError) {
			console.error("Error fetching owned boards:", ownedError);
			return NextResponse.json({ error: ownedError.message }, { status: 500 });
		}

		// Fetch boards where user is a participant
		const { data: participantBoards, error: participantError } =
			await supabaseAdmin
				.from("board_participants")
				.select(`
				board:boards(
					*,
					participants:board_participants(
						*,
						user:users(*)
					)
				)
			`)
				.eq("user_id", dbUser.id);

		if (participantError) {
			console.error("Error fetching participant boards:", participantError);
			return NextResponse.json(
				{ error: participantError.message },
				{ status: 500 },
			);
		}

		// Combine and deduplicate boards
		const allBoards = [...(ownedBoards || [])];
		const boardIds = new Set(allBoards.map((b) => b.id));

		// Add participant boards that aren't already in the list
		if (participantBoards) {
			for (const pb of participantBoards) {
				// Extract the board from the nested structure
				const board = (pb as { board?: (typeof allBoards)[0] })?.board;
				if (board && !boardIds.has(board.id) && board.is_active) {
					allBoards.push(board);
					boardIds.add(board.id);
				}
			}
		}

		// Sort by creation date
		allBoards.sort(
			(a, b) =>
				new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
		);

		return NextResponse.json({ boards: allBoards });
	} catch (error) {
		console.error("Fetch boards error:", error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			{ status: 500 },
		);
	}
}

export async function POST(request: Request) {
	try {
		const { userId } = await auth();

		if (!userId) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const body = await request.json();
		const { name, description } = body;

		// Get user from database using admin client (no RLS)
		const userResult = await supabaseAdmin
			.from("users")
			.select("id")
			.eq("clerk_id", userId)
			.maybeSingle();

		let dbUser = userResult.data;
		const userError = userResult.error;

		if (userError && userError.code !== "PGRST116") {
			console.error("Error fetching user:", userError);
			return NextResponse.json({ error: userError.message }, { status: 500 });
		}

		// If user doesn't exist, sync them from Clerk
		if (!dbUser) {
			const clerkUser = await currentUser();
			if (!clerkUser) {
				return NextResponse.json(
					{ error: "Could not fetch user details from Clerk" },
					{ status: 500 },
				);
			}

			// Create user in database
			const { data: newUser, error: createError } = await supabaseAdmin
				.from("users")
				.insert({
					clerk_id: userId,
					email: clerkUser.emailAddresses[0]?.emailAddress ?? "",
					name: clerkUser.fullName ?? clerkUser.username ?? "",
					avatar_url: clerkUser.imageUrl,
				})
				.select("id")
				.single();

			if (createError) {
				console.error("Error creating user:", createError);
				return NextResponse.json(
					{ error: "Failed to sync user to database" },
					{ status: 500 },
				);
			}

			dbUser = newUser;
		}

		// Create board using admin client
		const { data: board, error: boardError } = await supabaseAdmin
			.from("boards")
			.insert({
				name,
				description,
				owner_id: dbUser.id,
			})
			.select()
			.single();

		if (boardError) {
			console.error("Error creating board:", boardError);
			return NextResponse.json({ error: boardError.message }, { status: 500 });
		}

		// Add owner as participant using admin client
		const { error: participantError } = await supabaseAdmin
			.from("board_participants")
			.insert({
				board_id: board.id,
				user_id: dbUser.id,
				role: "owner",
			});

		if (participantError) {
			console.error("Error adding participant:", participantError);
			// Don't fail the whole operation if participant add fails
		}

		// Create default columns (use admin client as columns might not have RLS)
		const defaultColumns = [
			{
				board_id: board.id,
				name: "What went well",
				color: "#10b981", // Green color for good things
				position: 0,
				is_action: false,
			},
			{
				board_id: board.id,
				name: "What didn't go well",
				color: "#f59e0b", // Orange color for bad things
				position: 1,
				is_action: false,
			},
			{
				board_id: board.id,
				name: "Action Items",
				color: "#ef4444", // Red color for action items
				position: 2,
				is_action: true,
			},
		];

		const { error: columnsError } = await supabaseAdmin
			.from("columns")
			.insert(defaultColumns);

		if (columnsError) {
			console.error("Error creating default columns:", columnsError);
			// Don't fail the whole operation if column creation fails
		}

		return NextResponse.json({ board });
	} catch (error) {
		console.error("Create board error:", error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			{ status: 500 },
		);
	}
}
