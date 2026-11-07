import { NextResponse } from "next/server";
import { flagEnabled } from "~/lib/flags";
import { authorizeChannel } from "~/lib/realtime/authorize";
import { integrationError } from "~/lib/tracklines/api";
import {
	planningState,
	planPokerStories,
	pokerPlans,
} from "~/lib/tracklines/poker";

type Context = { params: Promise<{ sessionId: string }> };
async function authorize(context: Context) {
	if (!(await flagEnabled("rb-6"))) return null;
	const { sessionId } = await context.params;
	const identity = await authorizeChannel(`poker:${sessionId}`);
	return identity?.role === "facilitator" ? sessionId : null;
}
export async function GET(_request: Request, context: Context) {
	const id = await authorize(context);
	if (!id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	try {
		const { session, sprints, stories } = await planningState(id);
		return NextResponse.json({
			sprints,
			stories,
			boardUrl: `https://tracklin.es/boards/${session.tracklines_board_id}`,
		});
	} catch (error) {
		return integrationError(error);
	}
}
export async function POST(request: Request, context: Context) {
	const id = await authorize(context);
	if (!id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	try {
		const { plans } = pokerPlans.parse(await request.json());
		return NextResponse.json({ results: await planPokerStories(id, plans) });
	} catch (error) {
		return integrationError(error);
	}
}
