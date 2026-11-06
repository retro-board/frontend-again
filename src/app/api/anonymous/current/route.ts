import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { reportError } from "~/lib/bugfixes";

import { db } from "~/lib/db";
export async function GET() {
	try {
		const cookieStore = await cookies();
		const sessionId = cookieStore.get("anonymous_session_id")?.value;

		if (!sessionId) {
			return NextResponse.json({ user: null });
		}

		const { data: anonymousUser } = await db
			.from("anonymous_users")
			.select("*")
			.eq("session_id", sessionId)
			.maybeSingle();

		return NextResponse.json({ user: anonymousUser });
	} catch (error) {
		reportError("Get anonymous user error:", error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			{ status: 500 },
		);
	}
}
