import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { getPool } from "../src/lib/db";
import type { Connection } from "../src/lib/tracklines/connection";
import {
	createTracklinesPoker,
	planningState,
	planPokerStories,
} from "../src/lib/tracklines/poker";
import {
	createSprintRetro,
	loadSprintItems,
	saveCardItems,
	selectedItems,
} from "../src/lib/tracklines/retros";
import { seal } from "../src/lib/tracklines/security";

if (!process.env.BACKEND_CHECK_DATABASE_URL)
	throw new Error(
		"Set BACKEND_CHECK_DATABASE_URL to an isolated test database",
	);
process.env.DATABASE_URL = process.env.BACKEND_CHECK_DATABASE_URL;
process.env.TRACKLINES_ENCRYPTION_KEY = "integration-test-only";
const projectId = randomUUID();
const futureId = randomUUID();
const boardId = randomUUID();
const sprintId = randomUUID();
const ticketId = randomUUID();
let online = true;
let failNextPlan = true;
const plannedWrites: { ticket: string; target: string; estimate: string }[] =
	[];
let tickets = [{ id: ticketId, key: "TL-1", title: "Ship", estimate: "5" }];
const server = createServer((request, response) => {
	if (!online) {
		response.writeHead(503);
		response.end("offline");
		return;
	}
	response.setHeader("content-type", "application/json");
	if (request.method === "PUT") {
		let body = "";
		request.on("data", (chunk) => {
			body += chunk;
		});
		request.on("end", () => {
			if (failNextPlan) {
				failNextPlan = false;
				response.writeHead(409);
				response.end(JSON.stringify({ error: "Capacity approval needed" }));
				return;
			}
			const input = JSON.parse(body);
			plannedWrites.push({
				ticket: request.url ?? "",
				target: input.planned_sprint_id,
				estimate: input.estimate,
			});
			response.writeHead(204);
			response.end();
		});
		return;
	}
	if (request.url?.includes("attachments")) {
		response.end(
			JSON.stringify([
				{
					id: randomUUID(),
					name: "design.png",
					url: "https://files.test/design",
					content_type: "image/png",
				},
			]),
		);
		return;
	}
	if (request.url?.includes("planned-sprints")) {
		response.end(
			JSON.stringify([
				{ id: futureId, board_id: boardId, number: 23 },
				{ id: sprintId, board_id: boardId, number: 22 },
			]),
		);
		return;
	}
	if (request.url?.includes("backlog")) {
		response.end(JSON.stringify(tickets));
		return;
	}
	const data =
		request.url === "/projects"
			? [{ id: projectId, name: "TrackLines" }]
			: request.url === `/boards/${boardId}`
				? {
						id: boardId,
						project_id: projectId,
						name: "Frontend",
						estimate_scale: "powers",
						sprint: { id: sprintId },
					}
				: { id: sprintId, board_id: boardId, number: 22, tickets };
	response.end(JSON.stringify(data));
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
assert.ok(address && typeof address !== "string");
process.env.TRACKLINES_API_URL = `http://127.0.0.1:${address.port}`;
const pool = getPool();
let ownerId: string | undefined;
let guestId: string | undefined;
let pokerSessionId: string | undefined;
try {
	ownerId = (
		await pool.query(
			"INSERT INTO users (clerk_id,email) VALUES ($1,'fixture@example.test') RETURNING id",
			[randomUUID()],
		)
	).rows[0].id;
	guestId = (
		await pool.query(
			"INSERT INTO anonymous_users (session_id,display_name) VALUES ($1,'Guest') RETURNING id",
			[randomUUID()],
		)
	).rows[0].id;
	const connection = (
		await pool.query(
			"INSERT INTO tracklines_connections (user_id,service_key) VALUES ($1,$2) RETURNING *",
			[ownerId, seal("tl_s_fixture", ownerId ?? "")],
		)
	).rows[0] as Connection;
	const event = {
		event: "sprint.started" as const,
		data: { board_id: boardId, sprint: { id: sprintId, number: 22 } },
	};
	const [first, duplicate] = await Promise.all([
		createSprintRetro(connection, event),
		createSprintRetro(connection, event),
	]);
	assert.equal(first, duplicate);
	assert.equal(
		(await pool.query("SELECT name FROM boards WHERE id=$1", [first])).rows[0]
			.name,
		"TrackLines - Frontend - Sprint 22",
	);
	const columns = (
		await pool.query(
			"SELECT * FROM columns WHERE board_id=$1 ORDER BY position",
			[first],
		)
	).rows;
	assert.equal(columns.length, 3);
	assert.equal(columns[2].is_action, true);
	assert.equal(
		(
			await pool.query(
				"SELECT role FROM board_participants WHERE board_id=$1",
				[first],
			)
		).rows[0].role,
		"owner",
	);
	tickets = [
		...tickets,
		{ id: randomUUID(), key: "TL-2", title: "Mid-sprint", estimate: "3" },
	];
	assert.equal((await loadSprintItems(first)).items.length, 2);
	online = false;
	const cached = await loadSprintItems(first);
	assert.equal(cached.stale, true);
	assert.equal(cached.items.length, 2);
	const items = await selectedItems(first, [ticketId]);
	const card = await saveCardItems(
		{
			column_id: columns[0].id,
			content: "Anonymous feedback",
			position: 0,
			anonymous_author_id: guestId,
		},
		items,
	);
	assert.equal(card.error, null);
	assert.ok(card.data);
	const cardId = card.data.id;
	assert.equal(
		(
			await pool.query(
				"SELECT count(*)::int AS n FROM card_items WHERE card_id=$1",
				[cardId],
			)
		).rows[0].n,
		1,
	);
	const scope = {
		cardId,
		boardId: first,
		authorId: guestId ?? "",
		anonymous: true,
	};
	const denied = await saveCardItems({ content: "bad" }, [], {
		...scope,
		authorId: ownerId ?? "",
	});
	assert.ok(denied.error);
	assert.equal(
		(await pool.query("SELECT content FROM cards WHERE id=$1", [cardId]))
			.rows[0].content,
		"Anonymous feedback",
	);
	assert.equal(
		(await saveCardItems({ content: "Updated" }, [], scope)).error,
		null,
	);
	assert.equal(
		(
			await pool.query(
				"SELECT count(*)::int AS n FROM card_items WHERE card_id=$1",
				[cardId],
			)
		).rows[0].n,
		0,
	);
	online = true;
	const session = await createTracklinesPoker(ownerId ?? "", {
		name: "Integration poker",
		project_id: projectId,
		board_id: boardId,
		result_method: "mode",
	});
	pokerSessionId = session.id;
	assert.equal(session.estimation_type, "powers");
	assert.deepEqual(session.estimation_values, ["1", "2", "4", "8", "16"]);
	const imported = (
		await pool.query(
			"SELECT * FROM stories WHERE session_id=$1 ORDER BY position",
			[session.id],
		)
	).rows;
	assert.equal(imported.length, 2);
	assert.equal(imported[0].tracklines_attachments[0].name, "design.png");
	await pool.query(
		"UPDATE stories SET is_estimated=true,final_estimate='4' WHERE session_id=$1",
		[session.id],
	);
	assert.deepEqual(
		(await planningState(session.id)).sprints.map((sprint) => sprint.id),
		[futureId],
	);
	const forbidden = await planPokerStories(session.id, [
		{ story_id: imported[0].id, planned_sprint_id: sprintId },
	]);
	assert.equal(forbidden[0]?.status, "failed");
	assert.equal(plannedWrites.length, 0);
	const batch = imported.map((story) => ({
		story_id: story.id,
		planned_sprint_id: futureId,
	}));
	const partial = await planPokerStories(session.id, batch);
	assert.deepEqual(
		partial.map((row) => row.status),
		["failed", "planned"],
	);
	assert.equal(partial[0]?.error, "Capacity approval needed");
	const firstPlan = batch[0];
	assert.ok(firstPlan);
	const retry = await planPokerStories(session.id, [firstPlan]);
	assert.equal(retry[0]?.status, "planned");
	assert.equal(plannedWrites.length, 2);
	assert.ok(
		plannedWrites.every(
			(write) => write.target === futureId && write.estimate === "4",
		),
	);
	await pool.query("UPDATE stories SET final_estimate='?' WHERE id=$1", [
		imported[0].id,
	]);
	assert.equal(
		(await planPokerStories(session.id, [firstPlan]))[0]?.status,
		"skipped",
	);
	console.log(
		"Poker integration checks passed: imported stories and attachments, board card sets, future-only planning, per-ticket failures, retry and abstention",
	);

	console.log(
		"TrackLin.es checks passed: concurrent sprint webhook idempotency, default columns, live refresh, offline cache, anonymous links, unlink and authorization",
	);
} finally {
	if (pokerSessionId)
		await pool.query("DELETE FROM poker_sessions WHERE id=$1", [
			pokerSessionId,
		]);
	if (ownerId) {
		await pool.query("DELETE FROM boards WHERE owner_id=$1", [ownerId]);
		await pool.query("DELETE FROM users WHERE id=$1", [ownerId]);
	}
	if (guestId)
		await pool.query("DELETE FROM anonymous_users WHERE id=$1", [guestId]);
	await pool.end();
	await new Promise<void>((resolve, reject) =>
		server.close((error) => (error ? reject(error) : resolve())),
	);
}
