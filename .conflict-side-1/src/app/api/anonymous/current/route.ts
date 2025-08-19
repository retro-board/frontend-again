import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { supabaseAdmin } from "~/lib/supabase/admin";
export async function GET() {
	try {
		const cookieStore = await cookies();
		const sessionId = cookieStore.get("anonymous_session_id")?.value;

		if (!sessionId) {
			return NextResponse.json({ user: null });
		}

		const { data: anonymousUser } = await supabaseAdmin
			.from("anonymous_users")
			.select("*")
			.eq("session_id", sessionId)
			.maybeSingle();

		return NextResponse.json({ user: anonymousUser });
	} catch (error) {
		console.error("Get anonymous user error:", error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			{ status: 500 },
		);
	}
}
