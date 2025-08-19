import { createClient } from "@supabase/supabase-js";
import { auth } from "@clerk/nextjs/server";
import jwt from "jsonwebtoken";
import { env } from "~/env";
import { supabaseAdmin } from "./admin";

export async function createAuthenticatedSupabaseClient() {
	const { userId } = await auth();
	
	if (!userId) {
		throw new Error("User not authenticated");
	}

	// First ensure the user exists in Supabase
	const { data: dbUser } = await supabaseAdmin
		.from("users")
		.select("id")
		.eq("clerk_id", userId)
		.maybeSingle();

	if (!dbUser) {
		// Create user if they don't exist
		const { getUser } = await auth();
		const user = await getUser(userId);
		
		if (user) {
			await supabaseAdmin.from("users").insert({
				clerk_id: userId,
				email: user.emailAddresses[0]?.emailAddress || "",
				name: `${user.firstName || ""} ${user.lastName || ""}`.trim() || "Anonymous",
			});
		}
	}

	// Create a custom JWT for Supabase that identifies the Clerk user
	const supabaseToken = jwt.sign(
		{
			sub: userId, // This will be available as auth.uid() in RLS policies
			role: "authenticated",
			aud: "authenticated",
			iat: Math.floor(Date.now() / 1000),
			exp: Math.floor(Date.now() / 1000) + 60 * 60, // 1 hour expiry
		},
		env.SUPABASE_JWT_SECRET || env.SUPABASE_SERVICE_ROLE_KEY,
		{ algorithm: "HS256" }
	);

	// Create a Supabase client with the custom token
	return createClient(
		env.NEXT_PUBLIC_SUPABASE_URL,
		env.NEXT_PUBLIC_SUPABASE_ANON_KEY, // Use anon key, not service role
		{
			auth: {
				autoRefreshToken: false,
				persistSession: false,
			},
			global: {
				headers: {
					Authorization: `Bearer ${supabaseToken}`,
				},
			},
		}
	);
}