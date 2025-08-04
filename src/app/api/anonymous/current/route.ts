import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { env } from "~/env";

// Create admin client with service role key
const supabaseAdmin = createClient(
	env.NEXT_PUBLIC_SUPABASE_URL,
	env.SUPABASE_SERVICE_ROLE_KEY,
	{
		auth: {
			autoRefreshToken: false,
			persistSession: false,
		},
	},
);

export async function GET() {
	try {
		const cookieStore = cookies();
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
