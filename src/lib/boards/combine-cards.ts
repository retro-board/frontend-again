import { getPool } from "~/lib/db";

export async function combineCards(
	boardId: string,
	ownerId: string,
	sourceIds: string[],
	targetId?: string,
	content?: string,
) {
	if (targetId && !sourceIds.includes(targetId))
		return { status: 400, error: "Target must be one of the source cards" };
	const client = await getPool().connect();
	try {
		await client.query("BEGIN");
		const board = (
			await client.query(
				"SELECT owner_id, phase FROM boards WHERE id = $1 FOR UPDATE",
				[boardId],
			)
		).rows[0];
		if (!board || board.owner_id !== ownerId || board.phase !== "reveal")
			return { status: 403, error: "Combining cards is not allowed" };
		const cards = (
			await client.query(
				"SELECT c.* FROM cards c JOIN columns col ON col.id = c.column_id WHERE c.id = ANY($1::uuid[]) AND col.board_id = $2 ORDER BY c.position, c.id FOR UPDATE OF c",
				[sourceIds, boardId],
			)
		).rows;
		if (cards.length !== new Set(sourceIds).size)
			return { status: 404, error: "Source card not found" };
		const first = cards[0];
		if (!first) return { status: 400, error: "No source cards" };
		const finalContent =
			content || cards.map((card) => card.content).join("\n---\n");
		let finalCardId = targetId;
		if (targetId)
			await client.query(
				"UPDATE cards SET content = $1, updated_at = now() WHERE id = $2",
				[finalContent, targetId],
			);
		else
			finalCardId = (
				await client.query(
					"INSERT INTO cards(column_id, content, author_id, position, is_anonymous, is_masked) VALUES ($1, $2, $3, $4, false, false) RETURNING id",
					[first.column_id, finalContent, ownerId, first.position],
				)
			).rows[0].id;
		await client.query(
			"DELETE FROM cards WHERE id = ANY($1::uuid[]) AND id <> $2",
			[sourceIds, finalCardId],
		);
		await client.query("COMMIT");
		return { cardId: finalCardId as string, content: finalContent };
	} finally {
		await client.query("ROLLBACK").catch(() => {});
		client.release();
	}
}
