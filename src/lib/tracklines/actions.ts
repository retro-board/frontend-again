import { reportError } from "~/lib/bugfixes";
import { getPool } from "~/lib/db";
import { flagEnabled } from "~/lib/flags";
import { clientFor } from "./connection";

export async function actionItemsEnabled() {
	return (await flagEnabled("rb-27")) && (await flagEnabled("rb-5"));
}
export async function retroActionItems(boardId: string) {
	const pool = getPool();
	const linked = await pool.query(
		"SELECT b.phase FROM tracklines_retros r JOIN boards b ON b.id=r.board_id WHERE r.board_id=$1",
		[boardId],
	);
	if (!linked.rows.length)
		return { linked: false, completed: false, actions: [] };
	const { rows } = await pool.query(
		`SELECT c.id, c.content, c.is_masked, a.ticket_key, a.ticket_id, a.sync_error
 FROM cards c JOIN columns col ON col.id=c.column_id
 LEFT JOIN tracklines_action_items a ON a.card_id=c.id
 WHERE col.board_id=$1 AND col.is_action ORDER BY col.position, c.position, c.id`,
		[boardId],
	);
	return {
		linked: true,
		completed: linked.rows[0].phase === "completed",
		actions: rows.map((row) => ({
			id: row.id as string,
			content: row.is_masked ? "" : (row.content as string),
			ticketKey: row.ticket_key as string | null,
			url: row.ticket_id
				? `https://tracklin.es/tickets/${encodeURIComponent(row.ticket_id)}`
				: null,
			error: row.sync_error as string | null,
			waitingForReveal: !!row.is_masked,
		})),
	};
}

async function syncAction(boardId: string, cardId: string) {
	const client = await getPool().connect();
	try {
		await client.query("BEGIN");
		// Serialize duplicate saves/retries, including across app instances.
		await client.query(
			"SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
			[`retro-action:${cardId}`],
		);
		const { rows } = await client.query(
			`SELECT c.id, c.content, c.is_masked, r.user_id, r.tracklines_board_id,
   r.sprint_id, b.name AS retro_name, b.phase, a.ticket_id
   FROM cards c JOIN columns col ON col.id=c.column_id JOIN boards b ON b.id=col.board_id
   JOIN tracklines_retros r ON r.board_id=b.id
   LEFT JOIN tracklines_action_items a ON a.card_id=c.id
   WHERE c.id=$1 AND col.board_id=$2 AND col.is_action FOR UPDATE OF c`,
			[cardId, boardId],
		);
		const card = rows[0];
		if (card?.phase !== "completed" || card.ticket_id || card.is_masked) {
			await client.query("COMMIT");
			return;
		}
		await client.query(
			"INSERT INTO tracklines_action_items(card_id) VALUES ($1) ON CONFLICT DO NOTHING",
			[cardId],
		);
		try {
			const api = await clientFor(card.user_id);
			if (!api)
				throw new Error("Reconnect TrackLin.es in settings, then retry.");
			const board = await api.board(card.tracklines_board_id);
			if (board.id !== card.tracklines_board_id)
				throw new Error("TrackLin.es board does not match this retro");
			const marker = `retro-action-${cardId}`;
			// Recover from an upstream success followed by a lost response or local commit failure.
			const existing = (await api.actionTickets(board.project_id, marker)).find(
				(ticket) =>
					ticket.labels?.includes(marker) ||
					ticket.description?.includes(`Source action: ${marker}`),
			);
			const content = String(card.content).trim();
			if (!content) throw new Error("Action item is empty");
			const title =
				content.split(/\r?\n/)[0]?.slice(0, 200) || "Retro action item";
			const source = process.env.APP_URL
				? `${process.env.APP_URL.replace(/\/$/, "")}/boards/${encodeURIComponent(boardId)}`
				: null;
			const ticket =
				existing ??
				(await api.createBacklogTask(board.project_id, {
					title,
					description: `${content}\n\n---\nFrom retro: ${card.retro_name}\nTrackLin.es board: ${board.name} (${board.id})\nSprint: ${card.sprint_id}\nSource action: ${marker}${source ? `\nRetro: ${source}` : ""}`,
					labels: ["retro-action", marker, board.name.slice(0, 50)],
				}));
			await client.query(
				"UPDATE tracklines_action_items SET ticket_id=$2, ticket_key=$3, sync_error=NULL, synced_at=now() WHERE card_id=$1",
				[cardId, ticket.id, ticket.key],
			);
		} catch (error) {
			await client.query(
				"UPDATE tracklines_action_items SET sync_error=$2 WHERE card_id=$1",
				[
					cardId,
					error instanceof Error ? error.message : "Could not send action item",
				],
			);
		}
		await client.query("COMMIT");
	} catch (error) {
		await client.query("ROLLBACK").catch(() => {});
		throw error;
	} finally {
		client.release();
	}
}

// Local cards stay saved when the integration is disconnected or unavailable.
export async function syncRetroActions(boardId: string) {
	try {
		if (!(await actionItemsEnabled())) return;
		const { rows } = await getPool().query(
			`SELECT c.id FROM cards c JOIN columns col ON col.id=c.column_id
   JOIN tracklines_retros r ON r.board_id=col.board_id JOIN boards b ON b.id=col.board_id
   LEFT JOIN tracklines_action_items a ON a.card_id=c.id
   WHERE col.board_id=$1 AND b.phase='completed' AND col.is_action AND NOT c.is_masked AND a.ticket_id IS NULL
   ORDER BY c.id`,
			[boardId],
		);
		for (const card of rows) await syncAction(boardId, card.id);
	} catch (error) {
		reportError("TrackLin.es action-item sync failed", error);
	}
}
