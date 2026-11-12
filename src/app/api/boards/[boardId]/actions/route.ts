import { NextResponse } from "next/server";
import { authorizeChannel } from "~/lib/realtime/authorize";
import {
	actionItemsEnabled,
	retroActionItems,
	syncRetroActions,
} from "~/lib/tracklines/actions";

type Context = { params: Promise<{ boardId: string }> };
export async function GET(_request: Request, { params }: Context) {
	if (!(await actionItemsEnabled()))
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	const { boardId } = await params;
	if (!(await authorizeChannel(`board:${boardId}`)))
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	return NextResponse.json(await retroActionItems(boardId));
}
export async function POST(_request: Request, { params }: Context) {
	if (!(await actionItemsEnabled()))
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	const { boardId } = await params;
	const identity = await authorizeChannel(`board:${boardId}`);
	if (!identity || identity.anonymous || identity.role !== "owner")
		return NextResponse.json(
			{ error: "Only the board owner can send action items" },
			{ status: 403 },
		);
	const status = await retroActionItems(boardId);
	if (!status.linked)
		return NextResponse.json(
			{ error: "This retro is not linked to TrackLin.es" },
			{ status: 404 },
		);
	if (!status.completed)
		return NextResponse.json(
			{ error: "Complete the retro before sending action items" },
			{ status: 409 },
		);
	await syncRetroActions(boardId);
	return NextResponse.json(await retroActionItems(boardId));
}
