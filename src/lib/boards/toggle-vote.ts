import { getPool } from "~/lib/db";

export async function toggleBoardVote(
	boardId: string,
	cardId: string,
	voterId: string,
	anonymous: boolean,
) {
	const client = await getPool().connect();
	const voterColumn = anonymous ? "anonymous_user_id" : "user_id";
	const membershipTable = anonymous
		? "board_anonymous_participants"
		: "board_participants";
	try {
		await client.query("BEGIN");
		// Serialize all vote toggles for this board. READ COMMITTED sees prior commits after the lock.
		const board = (
			await client.query(
				"SELECT phase, votes_per_user FROM boards WHERE id = $1 FOR UPDATE",
				[boardId],
			)
		).rows[0];
		if (!board) return { status: 404, error: "Board not found" };
		const member = await client.query(
			`SELECT 1 FROM ${membershipTable} WHERE board_id = $1 AND ${voterColumn} = $2`,
			[boardId, voterId],
		);
		if (!member.rowCount) return { status: 403, error: "Forbidden" };
		const card = (
			await client.query(
				"SELECT c.id, col.is_action FROM cards c JOIN columns col ON col.id = c.column_id WHERE c.id = $1 AND col.board_id = $2",
				[cardId, boardId],
			)
		).rows[0];
		if (!card) return { status: 404, error: "Card not found" };
		if (board.phase !== "voting" || card.is_action)
			return { status: 400, error: "Voting is not allowed for this card" };
		const removed = await client.query(
			`DELETE FROM card_votes WHERE card_id = $1 AND ${voterColumn} = $2 RETURNING id`,
			[cardId, voterId],
		);
		if (removed.rowCount) {
			await client.query("COMMIT");
			return { voted: false };
		}
		const count = Number(
			(
				await client.query(
					`SELECT count(*) FROM card_votes v JOIN cards c ON c.id = v.card_id JOIN columns col ON col.id = c.column_id WHERE col.board_id = $1 AND v.${voterColumn} = $2`,
					[boardId, voterId],
				)
			).rows[0].count,
		);
		if (count >= board.votes_per_user)
			return { status: 400, error: "Vote limit reached" };
		await client.query(
			`INSERT INTO card_votes(card_id, ${voterColumn}) VALUES ($1, $2)`,
			[cardId, voterId],
		);
		await client.query("COMMIT");
		return { voted: true, remainingVotes: board.votes_per_user - count - 1 };
	} finally {
		await client.query("ROLLBACK").catch(() => {});
		client.release();
	}
}
