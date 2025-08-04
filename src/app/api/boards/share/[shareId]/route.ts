import { createClient } from "@supabase/supabase-js";
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

export async function GET(
	request: Request,
	{ params }: { params: { shareId: string } },
) {
	try {
		const { data: board, error } = await supabaseAdmin
			.from("boards")
			.select("id, name, description, is_active")
			.eq("share_id", params.shareId)
			.eq("is_active", true)
			.maybeSingle();

		if (error) {
			console.error("Error fetching board:", error);
			return NextResponse.json({ error: error.message }, { status: 500 });
		}

		if (!board) {
			return NextResponse.json(
				{ error: "Board not found or inactive" },
				{ status: 404 },
			);
		}

		return NextResponse.json({ board });
	} catch (error) {
		console.error("Get board by share ID error:", error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			{ status: 500 },
		);
	}
}
