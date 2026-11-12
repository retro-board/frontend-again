import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { toggleBoardVote } from "../src/lib/boards/toggle-vote";
import { getPool } from "../src/lib/db";

if (!process.env.BACKEND_CHECK_DATABASE_URL)
	throw new Error(
		"Set BACKEND_CHECK_DATABASE_URL to an isolated migrated database",
	);
process.env.DATABASE_URL = process.env.BACKEND_CHECK_DATABASE_URL;
const pool = getPool();
let userId: string | undefined;
try {
	userId = (
		await pool.query(
			"INSERT INTO users(clerk_id, email) VALUES ($1, $2) RETURNING id",
			[randomUUID(), "vote-security@example.invalid"],
		)
	).rows[0].id;
	const voterId = userId;
	assert(voterId);
	const boardId = (
		await pool.query(
			"INSERT INTO boards(name, owner_id, phase, votes_per_user) VALUES ('vote-security', $1, 'voting', 3) RETURNING id",
			[userId],
		)
	).rows[0].id;
	await pool.query(
		"INSERT INTO board_participants(board_id, user_id) VALUES ($1, $2)",
		[boardId, userId],
	);
	const columnId = (
		await pool.query(
			"INSERT INTO columns(board_id, name, position) VALUES ($1, 'feedback', 0) RETURNING id",
			[boardId],
		)
	).rows[0].id;
	const cards = (
		await pool.query(
			"INSERT INTO cards(column_id, content, author_id, position) SELECT $1, 'feedback', $2, n FROM generate_series(1, 20) n RETURNING id",
			[columnId, userId],
		)
	).rows;
	const results = await Promise.all(
		cards.map((card) => toggleBoardVote(boardId, card.id, voterId, false)),
	);
	assert.equal(results.filter((result) => result.voted).length, 3);
	assert.equal(
		Number(
			(
				await pool.query("SELECT count(*) FROM card_votes WHERE user_id = $1", [
					userId,
				])
			).rows[0].count,
		),
		3,
	);
	assert.equal(
		(await toggleBoardVote(boardId, randomUUID(), voterId, false)).status,
		404,
	);
	assert.equal(
		(await toggleBoardVote(boardId, cards[0].id, randomUUID(), false)).status,
		403,
	);
	await pool.query("UPDATE boards SET phase = 'completed' WHERE id = $1", [
		boardId,
	]);
	assert.equal(
		(await toggleBoardVote(boardId, cards[0].id, voterId, false)).status,
		400,
	);
	console.log(
		"Vote security: 20 concurrent requests respect cap=3; nonmembers, foreign cards and completed phase rejected",
	);
} finally {
	if (userId) {
		await pool.query("DELETE FROM boards WHERE owner_id = $1", [userId]);
		await pool.query("DELETE FROM users WHERE id = $1", [userId]);
	}
	await pool.end();
}
