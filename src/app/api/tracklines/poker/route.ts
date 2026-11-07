import { NextResponse } from "next/server";
import { z } from "zod";
import { integrationError, pokerUser } from "~/lib/tracklines/api";
import { clientFor } from "~/lib/tracklines/connection";
import {
	connectedClient,
	createTracklinesPoker,
	nextPokerSessionName,
	pokerBacklog,
	pokerSetup,
} from "~/lib/tracklines/poker";

export async function GET(request: Request) {
	const user = await pokerUser();
	if (typeof user !== "string") return user;
	try {
		const api = await clientFor(user);
		if (!api) return NextResponse.json({ connected: false });
		const query = new URL(request.url).searchParams;
		const project = query.get("project_id");
		const board = query.get("board_id");
		if (!project)
			return NextResponse.json({
				connected: true,
				projects: await api.projects(),
			});
		z.string().uuid().parse(project);
		if (!board) return NextResponse.json({ boards: await api.boards(project) });
		z.string().uuid().parse(board);
		const backlog = await pokerBacklog(
			await connectedClient(user),
			project,
			board,
		);
		return NextResponse.json({
			...backlog,
			session_name: await nextPokerSessionName(
				user,
				backlog.board.id,
				backlog.board.name,
			),
		});
	} catch (error) {
		return integrationError(error);
	}
}
export async function POST(request: Request) {
	const user = await pokerUser();
	if (typeof user !== "string") return user;
	try {
		const input = pokerSetup.parse(await request.json());
		return NextResponse.json({
			session: await createTracklinesPoker(user, input),
		});
	} catch (error) {
		return integrationError(error);
	}
}
