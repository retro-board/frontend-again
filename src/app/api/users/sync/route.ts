import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "~/lib/supabase/admin";

export async function POST(request: Request) {
	try {
		const { userId } = await auth();
		if (!userId) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}
		const body = await request.json();
		const { email, name, avatar_url } = body;

		// Check if user already exists
		const { data: existingUser, error: checkError } = await supabaseAdmin
			.from("users")
			.select("*")
			.eq("clerk_id", userId)
			.maybeSingle();

		if (checkError && checkError.code !== "PGRST116") {
			console.error("Error checking user:", checkError);
			return NextResponse.json({ error: checkError.message }, { status: 500 });
		}

		if (existingUser) {
			// Update user info if it has changed
			const { data: updatedUser, error: updateError } = await supabaseAdmin
				.from("users")
				.update({
					email,
					name,
					avatar_url,
					updated_at: new Date().toISOString(),
				})
				.eq("clerk_id", userId)
				.select()
				.single();

			if (updateError) {
				console.error("Error updating user:", updateError);
				// Return existing user even if update fails
				return NextResponse.json({ user: existingUser });
			}

			return NextResponse.json({ user: updatedUser });
		}

		// Create new user
		const { data: newUser, error } = await supabaseAdmin
			.from("users")
			.insert({
				clerk_id: userId,
				email,
				name,
				avatar_url,
			})
			.select()
			.single();

		if (error) {
			console.error("Error creating user:", error);
			return NextResponse.json({ error: error.message }, { status: 500 });
		}

		return NextResponse.json({ user: newUser });
	} catch (error) {
		console.error("Sync user error:", error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			{ status: 500 },
		);
	}
}
