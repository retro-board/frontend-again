import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { flagEnabled } from "~/lib/flags";
import { TracklinesError } from "./client";
import { dbUserId } from "./connection";

export async function pokerUser() {
	if (!(await flagEnabled("rb-6")))
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	const { userId } = await auth();
	const id = userId ? await dbUserId(userId) : null;
	return id ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
export function integrationError(error: unknown) {
	return NextResponse.json(
		{
			error:
				error instanceof Error ? error.message : "TrackLin.es request failed",
		},
		{ status: error instanceof TracklinesError ? error.status : 400 },
	);
}
