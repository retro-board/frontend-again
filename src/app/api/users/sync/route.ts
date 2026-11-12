import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { reportError } from "~/lib/bugfixes";
import { syncCustomer } from "~/lib/chewedfeed";
import { db } from "~/lib/db";

export async function POST(_request: Request) {
	try {
		const { userId } = await auth();
		if (!userId) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}
		const profile = await currentUser();
		if (!profile || profile.id !== userId)
			return NextResponse.json(
				{ error: "Profile unavailable" },
				{ status: 401 },
			);
		const email =
			profile.emailAddresses.find(
				(address) => address.id === profile.primaryEmailAddressId,
			)?.emailAddress ??
			profile.emailAddresses[0]?.emailAddress ??
			"";
		const name = profile.fullName ?? profile.username ?? "";
		const avatar_url = profile.imageUrl;

		// Check if user already exists
		const { data: existingUser, error: checkError } = await db
			.from("users")
			.select("*")
			.eq("clerk_id", userId)
			.maybeSingle();

		if (checkError && checkError.code !== "PGRST116") {
			reportError("Error checking user:", checkError);
			return NextResponse.json({ error: checkError.message }, { status: 500 });
		}

		if (existingUser) {
			// Update user info if it has changed
			const { data: updatedUser, error: updateError } = await db
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
				reportError("Error updating user:", updateError);
				// Return existing user even if update fails
				return NextResponse.json({ user: existingUser });
			}

			return NextResponse.json({ user: updatedUser });
		}

		// Create new user
		const { data: newUser, error } = await db
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
			reportError("Error creating user:", error);
			return NextResponse.json({ error: error.message }, { status: 500 });
		}

		await syncCustomer({ clerkId: userId, email, name }); // a new free customer in ChewedFeed HQ
		return NextResponse.json({ user: newUser });
	} catch (error) {
		reportError("Sync user error:", error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			{ status: 500 },
		);
	}
}
