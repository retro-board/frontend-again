import { NextResponse } from "next/server";
import { flagEnabled } from "~/lib/flags";
import { authorizeChannel } from "~/lib/realtime/authorize";
import { loadSprintItems } from "~/lib/tracklines/retros";

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ boardId: string }> },
) {
	if (!(await flagEnabled("rb-5")))
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	const { boardId } = await params;
	if (!(await authorizeChannel(`board:${boardId}`)))
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	return NextResponse.json(await loadSprintItems(boardId));
}
