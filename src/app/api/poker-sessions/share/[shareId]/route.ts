import { error as reportError } from "bugfixes";
import { NextResponse } from "next/server";
import { db } from "~/lib/db";

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ shareId: string }> },
) {
	try {
		const resolvedParams = await params;
		const { data: session, error } = await db
			.from("poker_sessions")
			.select("id, name, description, estimation_type, is_active")
			.eq("share_id", resolvedParams.shareId)
			.eq("is_active", true)
			.single();

		if (error || !session) {
			return NextResponse.json(
				{ error: "Session not found or inactive" },
				{ status: 404 },
			);
		}

		return NextResponse.json({ session });
	} catch (error) {
		reportError("Get poker session by share ID error:", error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			{ status: 500 },
		);
	}
}
