import { z } from "zod";
import { getPool } from "~/lib/db";
import { RESULT_METHODS } from "~/lib/poker/score";
import { type TracklinesClient, TracklinesError } from "./client";
import { clientFor } from "./connection";
import { tracklinesScale } from "./scales";

export const pokerSetup = z.object({
	name: z.string().trim().min(1).max(200),
	description: z.string().max(10000).optional(),
	project_id: z.string().uuid(),
	board_id: z.string().uuid(),
	result_method: z.enum(RESULT_METHODS).default("average"),
});
export const pokerPlans = z.object({
	plans: z
		.array(
			z.object({
				story_id: z.string().uuid(),
				planned_sprint_id: z.string().uuid(),
			}),
		)
		.max(200),
});

export async function connectedClient(
	userId: string,
): Promise<TracklinesClient> {
	const api = await clientFor(userId);
	if (!api)
		throw new TracklinesError("Connect TrackLin.es in settings first", 409);
	return api;
}

export async function pokerBacklog(
	api: TracklinesClient,
	projectId: string,
	boardId: string,
) {
	const board = await api.board(boardId);
	if (board.project_id !== projectId)
		throw new TracklinesError("Board belongs to another project", 400);
	const scale = tracklinesScale(board.estimate_scale);
	const tickets = (await api.backlog(projectId)).filter(
		(ticket) =>
			ticket.type !== "epic" && !ticket.sprint_id && !ticket.resolution,
	);
	return { board, scale, tickets };
}

export async function createTracklinesPoker(
	userId: string,
	input: z.infer<typeof pokerSetup>,
) {
	const api = await connectedClient(userId);
	const { board, scale, tickets } = await pokerBacklog(
		api,
		input.project_id,
		input.board_id,
	);
	if (!tickets.length)
		throw new TracklinesError(
			"This project has no backlog tickets to estimate",
			400,
		);
	// Fetch attachments before opening the transaction; a failed import leaves no partial session.
	const stories = [];
	for (const ticket of tickets)
		stories.push({ ticket, attachments: await api.attachments(ticket.id) });
	const client = await getPool().connect();
	try {
		await client.query("BEGIN");
		const session = (
			await client.query(
				"INSERT INTO poker_sessions (name,description,owner_id,estimation_type,result_method,tracklines_project_id,tracklines_board_id,estimation_values) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
				[
					input.name,
					input.description ?? null,
					userId,
					scale.type,
					input.result_method,
					input.project_id,
					board.id,
					scale.values,
				],
			)
		).rows[0];
		await client.query(
			"INSERT INTO poker_participants (session_id,user_id,role) VALUES ($1,$2,'facilitator')",
			[session.id, userId],
		);
		for (const [position, { ticket, attachments }] of stories.entries())
			await client.query(
				"INSERT INTO stories (session_id,title,description,position,tracklines_ticket_id,tracklines_key,tracklines_url,tracklines_attachments) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
				[
					session.id,
					ticket.title,
					ticket.description ?? null,
					position,
					ticket.id,
					ticket.key,
					`https://tracklin.es/tickets/${encodeURIComponent(ticket.id)}`,
					JSON.stringify(attachments),
				],
			);
		await client.query("COMMIT");
		return session;
	} catch (error) {
		await client.query("ROLLBACK");
		throw error;
	} finally {
		client.release();
	}
}

export async function planningState(sessionId: string) {
	const session = (
		await getPool().query(
			"SELECT * FROM poker_sessions WHERE id=$1 AND tracklines_board_id IS NOT NULL",
			[sessionId],
		)
	).rows[0];
	if (!session)
		throw new TracklinesError("This is not a TrackLin.es poker session", 404);
	const api = await connectedClient(session.owner_id);
	const planned = await api.plannedSprints(session.tracklines_board_id);
	// Filter even unexpected upstream entries: the current sprint is never a planning target.
	const board = await api.board(session.tracklines_board_id);
	const sprints = planned.filter(
		(sprint) => sprint.board_id === board.id && sprint.id !== board.sprint?.id,
	);
	const stories = (
		await getPool().query(
			"SELECT id,title,tracklines_key,tracklines_url,final_estimate,is_estimated,tracklines_planned_sprint_id,tracklines_planning_error FROM stories WHERE session_id=$1 AND tracklines_ticket_id IS NOT NULL ORDER BY position",
			[sessionId],
		)
	).rows;
	return { session, api, sprints, stories };
}
export type PlanningOutcome = {
	story_id: string;
	status: "planned" | "failed" | "skipped";
	error?: string;
	planned_sprint_id?: string;
};
export async function planPokerStories(
	sessionId: string,
	plans: z.infer<typeof pokerPlans>["plans"],
): Promise<PlanningOutcome[]> {
	const { session, api, sprints } = await planningState(sessionId);
	const allowed = new Set(sprints.map((sprint) => sprint.id));
	const results: PlanningOutcome[] = [];
	for (const plan of plans) {
		const story = (
			await getPool().query(
				"SELECT * FROM stories WHERE session_id=$1 AND id=$2 AND tracklines_ticket_id IS NOT NULL",
				[sessionId, plan.story_id],
			)
		).rows[0];
		if (!story) {
			results.push({
				story_id: plan.story_id,
				status: "failed",
				error: "Story does not belong to this session",
			});
			continue;
		}
		if (
			!story.is_estimated ||
			!story.final_estimate ||
			story.final_estimate === "?"
		) {
			results.push({ story_id: plan.story_id, status: "skipped" });
			continue;
		}
		try {
			if (!allowed.has(plan.planned_sprint_id))
				throw new Error(
					"Choose a planned future sprint; the current sprint is not allowed",
				);
			if (!session.estimation_values?.includes(story.final_estimate))
				throw new Error("The result is not on this board's estimate scale");
			await api.planTicket(
				story.tracklines_ticket_id,
				plan.planned_sprint_id,
				story.final_estimate,
			);
			await getPool().query(
				"UPDATE stories SET tracklines_planned_sprint_id=$2,tracklines_planning_error=NULL WHERE id=$1 AND session_id=$3",
				[story.id, plan.planned_sprint_id, sessionId],
			);
			results.push({
				story_id: story.id,
				status: "planned",
				planned_sprint_id: plan.planned_sprint_id,
			});
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Planning failed";
			await getPool().query(
				"UPDATE stories SET tracklines_planning_error=$2 WHERE id=$1 AND session_id=$3",
				[story.id, message, sessionId],
			);
			results.push({ story_id: story.id, status: "failed", error: message });
		}
	}
	return results;
}
