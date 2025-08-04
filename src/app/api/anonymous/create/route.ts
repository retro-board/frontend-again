import { nanoid } from "nanoid";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "~/lib/supabase/admin";

export async function POST(request: Request) {
	try {
		const body = await request.json();
		const { displayName } = body;

		if (!displayName?.trim()) {
			return NextResponse.json(
				{ error: "Display name is required" },
				{ status: 400 },
			);
		}

		// Get or create session ID
		const cookieStore = await cookies();
		let sessionId = cookieStore.get("anonymous_session_id")?.value;

		if (!sessionId) {
			sessionId = nanoid();
		}

		// Check if anonymous user already exists for this session
		const { data: existingUser } = await supabaseAdmin
			.from("anonymous_users")
			.select("*")
			.eq("session_id", sessionId)
			.maybeSingle();

		// biome-ignore lint/suspicious/noImplicitAnyLet: hmm
		let anonymousUser;

		if (existingUser) {
			// Update existing user's display name
			const { data, error } = await supabaseAdmin
				.from("anonymous_users")
				.update({ display_name: displayName })
				.eq("id", existingUser.id)
				.select()
				.single();

			if (error) {
				console.error("Error updating anonymous user:", error);
				return NextResponse.json({ error: error.message }, { status: 500 });
			}

			anonymousUser = data;
		} else {
			// Create new anonymous user
			const { data, error } = await supabaseAdmin
				.from("anonymous_users")
				.insert({
					session_id: sessionId,
					display_name: displayName,
				})
				.select()
				.single();

			if (error) {
				console.error("Error creating anonymous user:", error);
				return NextResponse.json({ error: error.message }, { status: 500 });
			}

			anonymousUser = data;
		}

		// Set session cookie
		const response = NextResponse.json({ user: anonymousUser });
		response.cookies.set("anonymous_session_id", sessionId, {
			httpOnly: true,
			secure: process.env.NODE_ENV === "production",
			sameSite: "lax",
			maxAge: 60 * 60 * 24 * 30, // 30 days
		});

		return response;
	} catch (error) {
		console.error("Anonymous user error:", error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			{ status: 500 },
		);
	}
}
