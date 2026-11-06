import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { db, getPool, identifier, projection } from "../src/lib/db";
import { pokerState } from "../src/lib/realtime/poker-state";
import { eventsKey, getRedis, publish } from "../src/lib/realtime/server";

// Separate variables prevent this destructive fixture check from using the application's .env database.
if (
	!process.env.BACKEND_CHECK_DATABASE_URL ||
	!process.env.BACKEND_CHECK_REDIS_URL
) {
	throw new Error(
		"Set BACKEND_CHECK_DATABASE_URL and BACKEND_CHECK_REDIS_URL to isolated test services",
	);
}
if (process.env.NODE_ENV === "test")
	throw new Error(
		"Run with NODE_ENV=development so real event publishing is enabled",
	);
process.env.DATABASE_URL = process.env.BACKEND_CHECK_DATABASE_URL;
process.env.REDIS_URL = process.env.BACKEND_CHECK_REDIS_URL;
const token = randomUUID();
const channel = `board:${token}`;
const redis = getRedis();
const reader = redis.duplicate();
let userId: string | undefined;
let anonymousId: string | undefined;
let sessionId: string | undefined;
try {
	// Validate every literal relational projection used by the real API against PostgreSQL.
	const directory = new URL("../src/app/api/", import.meta.url);
	let projections = 0;
	for (const file of await readdir(directory, { recursive: true })) {
		if (!file.endsWith("route.ts")) continue;
		const code = await readFile(new URL(file, directory), "utf8");
		let table: string | undefined;
		for (const match of code.matchAll(
			/\.from\("(\w+)"\)|\.select\(\s*(?:"([^"]*)"|`([^`]*)`)/g,
		)) {
			if (match[1]) {
				table = match[1];
				continue;
			}
			const fields = match[2] ?? match[3];
			if (!table || !fields) continue;
			await getPool().query(
				`EXPLAIN SELECT ${projection(table, fields)} FROM ${identifier(table)} t`,
			);
			projections++;
		}
	}
	const user = await db
		.from("users")
		.insert({
			clerk_id: token,
			email: "integration@example.test",
			name: "Integration",
		})
		.select()
		.single();
	assert.equal(user.error, null);
	userId = user.data.id;
	const anonymous = await db
		.from("anonymous_users")
		.insert({ session_id: token, display_name: "Guest" })
		.select()
		.single();
	assert.equal(anonymous.error, null);
	anonymousId = anonymous.data.id;
	const board = await db
		.from("boards")
		.insert({ owner_id: userId, name: token })
		.select()
		.single();
	assert.equal(board.error, null);
	const column = await db
		.from("columns")
		.insert({ board_id: board.data.id, name: "Ideas", position: 0 })
		.select()
		.single();
	assert.equal(column.error, null);
	const card = await db
		.from("cards")
		.insert({
			column_id: column.data.id,
			anonymous_author_id: anonymousId,
			content: "A guest card",
			position: 0,
		})
		.select()
		.single();
	assert.equal(card.error, null);
	const vote = await db
		.from("card_votes")
		.insert({ card_id: card.data.id, anonymous_user_id: anonymousId });
	assert.equal(vote.error, null);
	const duplicate = await db
		.from("card_votes")
		.insert({ card_id: card.data.id, anonymous_user_id: anonymousId });
	assert.equal(duplicate.error?.code, "23505");
	const nested = await db
		.from("columns")
		.select(
			"*, cards(*, author:users(name), anonymous_author:anonymous_users(display_name), votes:card_votes(*))",
		)
		.eq("id", column.data.id)
		.single();
	assert.equal(nested.error, null);
	assert.equal(nested.data.cards[0].anonymous_author.display_name, "Guest");
	assert.equal(nested.data.cards[0].author, null);
	assert.equal(nested.data.cards[0].votes.length, 1);
	const updated = await db
		.from("cards")
		.update({ content: "Updated" })
		.eq("id", card.data.id)
		.select()
		.single();
	assert.equal(updated.data.content, "Updated");
	const count = await db
		.from("cards")
		.select("*", { count: "exact", head: true })
		.eq("column_id", column.data.id);
	assert.equal(count.count, 1);
	const session = await db
		.from("poker_sessions")
		.insert({
			owner_id: userId,
			name: token,
			estimation_type: "fibonacci",
			is_voting: true,
			timer_ends_at: new Date(Date.now() + 60000).toISOString(),
		})
		.select()
		.single();
	assert.equal(session.error, null);
	sessionId = session.data.id;
	await db
		.from("poker_participants")
		.insert({ session_id: sessionId, user_id: userId, role: "facilitator" });
	await db
		.from("poker_anonymous_participants")
		.insert({ session_id: sessionId, anonymous_user_id: anonymousId });
	const story = await db
		.from("stories")
		.insert({ session_id: sessionId, title: "Test story", position: 0 })
		.select()
		.single();
	assert.equal(story.error, null);
	await db
		.from("poker_sessions")
		.update({ current_story_id: story.data.id })
		.eq("id", sessionId);
	await db.from("poker_votes").insert({
		story_id: story.data.id,
		anonymous_user_id: anonymousId,
		vote_value: "5",
	});
	const snapshot = await pokerState(sessionId ?? "");
	assert.equal(snapshot.participants.length, 2);
	assert.equal(
		snapshot.participants.find((person) => person.id === anonymousId)?.hasVoted,
		true,
	);
	assert.equal(snapshot.timer.isActive, true);
	assert.equal(snapshot.votingState.isVoting, true);
	assert.equal(snapshot.currentStory?.id, story.data.id);
	await publish(channel, "card_created", { cardId: card.data.id });
	const first = (await reader.xread(
		"BLOCK",
		1000,
		"STREAMS",
		eventsKey(channel),
		"0-0",
	)) as [string, [string, string[]][]][];
	const firstEvent = first[0]?.[1][0];
	assert.ok(firstEvent);
	assert.equal(JSON.parse(firstEvent[1][1] ?? "{}").event, "card_created");
	await publish(channel, "card_updated", { cardId: card.data.id });
	const replay = await reader.xrange(
		eventsKey(channel),
		`(${firstEvent[0]}`,
		"+",
	);
	assert.equal(replay.length, 1);
	assert.equal(JSON.parse(replay[0]?.[1][1] ?? "{}").event, "card_updated");
	assert.ok((await redis.ttl(eventsKey(channel))) > 0);
	console.log(
		`Backend checks passed: ${projections} API projections, CRUD, anonymous votes, poker snapshot, shared event delivery and replay`,
	);
} finally {
	if (sessionId) await db.from("poker_sessions").delete().eq("id", sessionId);
	if (userId) {
		await db.from("boards").delete().eq("owner_id", userId);
		await db.from("users").delete().eq("id", userId);
	}
	if (anonymousId)
		await db.from("anonymous_users").delete().eq("id", anonymousId);
	await redis.del(eventsKey(channel));
	reader.disconnect();
	redis.disconnect();
	await getPool().end();
}
