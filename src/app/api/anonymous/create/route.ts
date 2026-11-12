import { nanoid } from "nanoid";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { reportError } from "~/lib/bugfixes";
import { db } from "~/lib/db";
import { allowJoinRequest, anonymousDisplayName } from "~/lib/join-limits";

export async function POST(request: Request) {
	try {
		if (!(await allowJoinRequest(request, "create")))
			return NextResponse.json(
				{ error: "Too many requests" },
				{ status: 429, headers: { "Retry-After": "60" } },
			);
		const body = await request.json();
		const displayName = anonymousDisplayName(body?.displayName);

		if (!displayName) {
			return NextResponse.json(
				{ error: "Display name must be between 1 and 50 characters" },
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
		const { data: existingUser } = await db
			.from("anonymous_users")
			.select("id, display_name")
			.eq("session_id", sessionId)
			.maybeSingle();

		// biome-ignore lint/suspicious/noImplicitAnyLet: hmm
		let anonymousUser;

		if (existingUser) {
			// Update existing user's display name
			const { data, error } = await db
				.from("anonymous_users")
				.update({ display_name: displayName })
				.eq("id", existingUser.id)
				.select("id, display_name")
				.single();

			if (error) {
				reportError("Error updating anonymous user:", error);
				return NextResponse.json({ error: error.message }, { status: 500 });
			}

			anonymousUser = data;
		} else {
			// Create new anonymous user
			const { data, error } = await db
				.from("anonymous_users")
				.insert({
					session_id: sessionId,
					display_name: displayName,
				})
				.select("id, display_name")
				.single();

			if (error) {
				reportError("Error creating anonymous user:", error);
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
		reportError("Anonymous user error:", error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			{ status: 500 },
		);
	}
}
