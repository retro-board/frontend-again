import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { supabaseAdmin } from "~/lib/supabase/admin";

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
