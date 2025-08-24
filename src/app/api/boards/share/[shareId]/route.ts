import { NextResponse } from "next/server";
import { supabaseAdmin } from "~/lib/supabase/admin";

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ shareId: string }> },
) {
	try {
		const resolvedParams = await params;
		const { data: board, error } = await supabaseAdmin
			.from("boards")
			.select("id, name, description, is_active, phase")
			.eq("share_id", resolvedParams.shareId)
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
