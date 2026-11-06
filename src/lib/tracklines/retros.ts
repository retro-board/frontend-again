import type { QueryResultRow } from "pg";
import { z } from "zod";
import { getPool, identifier } from "~/lib/db";
import { type Ticket, tracklines } from "./client";
import { type Connection, clientFor } from "./connection";
import { open } from "./security";

export interface SprintItem {
	id: string;
	key: string;
	title: string;
	estimate: string | null;
	url: string;
}
export const sprintEvent = z.object({
	event: z.literal("sprint.started"),
	data: z.object({
		board_id: z.string().uuid(),
		sprint: z.object({
			id: z.string().uuid(),
			number: z.number().int().positive(),
		}),
	}),
});
export function sprintItems(tickets: Ticket[]): SprintItem[] {
	return tickets.map((ticket) => ({
		id: ticket.id,
		key: ticket.key,
		title: ticket.title,
		estimate: ticket.estimate,
		url: `https://tracklin.es/tickets/${encodeURIComponent(ticket.id)}`,
	}));
}

export async function createSprintRetro(
	connection: Connection,
	event: z.infer<typeof sprintEvent>,
) {
	const api = tracklines(open(connection.service_key, connection.user_id));
	// Reading both resources with this key verifies they belong to the connected TrackLin.es org.
	const [board, sprint, projects] = await Promise.all([
		api.board(event.data.board_id),
		api.sprint(event.data.sprint.id),
		api.projects(),
	]);
	const project = projects.find((project) => project.id === board.project_id);
	if (
		!project ||
		sprint.board_id !== board.id ||
		sprint.number !== event.data.sprint.number
	)
		throw new Error("Sprint does not belong to the connected board");
	const client = await getPool().connect();
	try {
		await client.query("BEGIN");
		await client.query(
			"SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
			[`${connection.user_id}:${sprint.id}`],
		);
		const existing = await client.query(
			"SELECT board_id FROM tracklines_retros WHERE user_id = $1 AND sprint_id = $2",
			[connection.user_id, sprint.id],
		);
		if (existing.rows[0]) {
			await client.query("COMMIT");
			return existing.rows[0].board_id as string;
		}
		const created = await client.query(
			"INSERT INTO boards (name, owner_id) VALUES ($1,$2) RETURNING id",
			[
				`${project.name} - ${board.name} - Sprint ${sprint.number}`,
				connection.user_id,
			],
		);
		const boardId = created.rows[0].id as string;
		await client.query(
			"INSERT INTO board_participants (board_id,user_id,role) VALUES ($1,$2,'owner')",
			[boardId, connection.user_id],
		);
		await client.query(
			"INSERT INTO columns (board_id,name,color,position,is_action) VALUES ($1,'What went well','#10b981',0,false), ($1,'What didn''t go well','#f59e0b',1,false), ($1,'Action Items','#ef4444',2,true)",
			[boardId],
		);
		await client.query(
			"INSERT INTO tracklines_retros (board_id,user_id,connection_id,sprint_id,tracklines_board_id,items,refreshed_at) VALUES ($1,$2,$3,$4,$5,$6,now())",
			[
				boardId,
				connection.user_id,
				connection.id,
				sprint.id,
				board.id,
				JSON.stringify(sprintItems(sprint.tickets)),
			],
		);
		await client.query("COMMIT");
		return boardId;
	} catch (error) {
		await client.query("ROLLBACK");
		throw error;
	} finally {
		client.release();
	}
}

export async function loadSprintItems(boardId: string) {
	const { rows } = await getPool().query(
		"SELECT * FROM tracklines_retros WHERE board_id=$1",
		[boardId],
	);
	const retro = rows[0];
	if (!retro) return { items: [] as SprintItem[], stale: false, linked: false };
	try {
		const api = await clientFor(retro.user_id);
		if (!api) throw new Error("TrackLin.es is disconnected");
		const sprint = await api.sprint(retro.sprint_id);
		if (sprint.board_id !== retro.tracklines_board_id)
			throw new Error("Sprint belongs to another board");
		const items = sprintItems(sprint.tickets);
		await getPool().query(
			"UPDATE tracklines_retros SET items=$2, refreshed_at=now() WHERE board_id=$1",
			[boardId, JSON.stringify(items)],
		);
		return { items, stale: false, linked: true };
	} catch {
		return {
			items: retro.items as SprintItem[],
			stale: true,
			linked: true,
			note: "TrackLin.es is unavailable. Showing the last saved sprint items.",
		};
	}
}

const itemIds = z
	.array(z.string().uuid())
	.max(100)
	.transform((ids) => [...new Set(ids)]);
export async function selectedItems(boardId: string, input: unknown) {
	const ids = itemIds.parse(input);
	if (!ids.length) return [];
	const { rows } = await getPool().query(
		"SELECT items FROM tracklines_retros WHERE board_id=$1",
		[boardId],
	);
	const items = (rows[0]?.items ?? []) as SprintItem[];
	const selected = ids.map((id) => items.find((item) => item.id === id));
	if (selected.some((item) => !item))
		throw new Error("Select items from this board's sprint");
	return selected as SprintItem[];
}

// Card content and its linked items commit together, including anonymous authors.
export async function saveCardItems(
	data: Record<string, unknown>,
	items: SprintItem[],
	scope?: {
		cardId: string;
		boardId: string;
		authorId: string;
		anonymous: boolean;
	},
) {
	const client = await getPool().connect();
	try {
		await client.query("BEGIN");
		const keys = Object.keys(data).filter((key) => data[key] !== undefined);
		let card: QueryResultRow;
		if (scope) {
			const existing = await client.query(
				`SELECT c.id FROM cards c JOIN columns col ON col.id=c.column_id WHERE c.id=$1 AND col.board_id=$2 AND c.${scope.anonymous ? "anonymous_author_id" : "author_id"}=$3 FOR UPDATE OF c`,
				[scope.cardId, scope.boardId, scope.authorId],
			);
			if (!existing.rows.length)
				throw new Error("Only the card author can change linked items");
			card = (
				await client.query(
					`UPDATE cards SET ${keys.map((key, i) => `${identifier(key)}=$${i + 2}`).join(",")} WHERE id=$1 RETURNING *`,
					[scope.cardId, ...keys.map((key) => data[key])],
				)
			).rows[0];
			await client.query("DELETE FROM card_items WHERE card_id=$1", [
				scope.cardId,
			]);
		} else {
			card = (
				await client.query(
					`INSERT INTO cards (${keys.map(identifier).join(",")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(",")}) RETURNING *`,
					keys.map((key) => data[key]),
				)
			).rows[0];
		}
		for (const item of items)
			await client.query(
				"INSERT INTO card_items (card_id,ticket_id,ticket_key,title,url) VALUES ($1,$2,$3,$4,$5)",
				[card.id, item.id, item.key, item.title, item.url],
			);
		await client.query("COMMIT");
		return { data: card, error: null };
	} catch (error) {
		await client.query("ROLLBACK");
		return {
			data: null,
			error: {
				message:
					error instanceof Error
						? error.message
						: "Could not save linked items",
			},
		};
	} finally {
		client.release();
	}
}
