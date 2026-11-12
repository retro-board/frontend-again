import { ReadableStream } from "node:stream/web";
import { TextEncoder } from "node:util";
import { db } from "~/lib/db";
import { authorizeChannel } from "~/lib/realtime/authorize";
import { pokerState } from "~/lib/realtime/poker-state";
import { getRedis, publish } from "~/lib/realtime/server";
import { createMockRequest } from "~/test/helpers";
import { GET, POST } from "./route";

jest.mock("~/lib/realtime/authorize", () => ({ authorizeChannel: jest.fn() }));
jest.mock("~/lib/realtime/server", () => ({
	getRedis: jest.fn(),
	publish: jest.fn(),
	eventsKey: (channel: string) => `retro:events:${channel}`,
}));
jest.mock("~/lib/realtime/poker-state", () => ({ pokerState: jest.fn() }));
const authorize = authorizeChannel as jest.Mock;
const channel = "poker:11111111-1111-4111-8111-111111111111";
const context = { params: Promise.resolve({ channel }) };
const member = {
	kind: "poker",
	id: channel.split(":")[1],
	user: { id: "db-user", name: "Alice" },
	anonymous: false,
	role: "voter",
};
function request(payload: unknown, event = "poker_message") {
	return createMockRequest(`https://retro.example/api/realtime/${channel}`, {
		method: "POST",
		body: { event, payload },
	});
}

beforeEach(() => {
	jest.clearAllMocks();
	authorize.mockReset().mockResolvedValue(member);
});

test("rejects outsiders and board broadcasts", async () => {
	authorize.mockResolvedValueOnce(null);
	expect((await POST(request({ type: "vote" }), context)).status).toBe(403);
	authorize.mockResolvedValueOnce({ ...member, kind: "board" });
	expect((await POST(request({ type: "vote" }), context)).status).toBe(403);
	expect(publish).not.toHaveBeenCalled();
});

test("rejects facilitator events from voters and voting from observers", async () => {
	expect(
		(await POST(request({ type: "timer_start", duration: 60 }), context))
			.status,
	).toBe(403);
	authorize.mockResolvedValueOnce({ ...member, role: "observer" });
	expect((await POST(request({ type: "vote" }), context)).status).toBe(403);
	expect(publish).not.toHaveBeenCalled();
});

test("derives identity, session and join role from the authenticated membership", async () => {
	const response = await POST(
		request({
			type: "join",
			role: "facilitator",
			userId: "someone-else",
			sessionId: "other-session",
			userName: "Imposter",
		}),
		context,
	);
	expect(response.status).toBe(200);
	expect(publish).toHaveBeenCalledWith(
		channel,
		"poker_message",
		expect.objectContaining({
			userId: "db-user",
			userName: "Alice",
			role: "voter",
			sessionId: member.id,
		}),
	);
});

test("rejects cross-origin requests and unknown events", async () => {
	const crossOrigin = createMockRequest(
		`https://retro.example/api/realtime/${channel}`,
		{
			method: "POST",
			headers: { origin: "https://elsewhere.example" },
			body: { event: "poker_message", payload: { type: "join" } },
		},
	);
	expect((await POST(crossOrigin, context)).status).toBe(403);
	expect((await POST(request({ type: "session_sync" }), context)).status).toBe(
		400,
	);
	expect(publish).not.toHaveBeenCalled();
});

test("accepts the browser's origin behind the proxy (request.url is internal)", async () => {
	authorize.mockResolvedValue({ ...member, role: "facilitator" });
	const behindProxy = createMockRequest(
		`http://localhost:8080/api/realtime/${channel}`,
		{
			method: "POST",
			headers: {
				origin: "https://retro-board.net",
				host: "retro-board.net",
				"x-forwarded-proto": "https",
			},
			body: {
				event: "poker_message",
				payload: {
					type: "story_select",
					storyId: "22222222-2222-4222-8222-222222222222",
					storyTitle: "Next story",
				},
			},
		},
	);
	expect((await POST(behindProxy, context)).status).toBe(200);
	expect(publish).toHaveBeenCalled();
});

test("persists timers and derives their deadline on the server", async () => {
	authorize.mockResolvedValue({ ...member, role: "facilitator" });
	const eq = jest.fn().mockResolvedValue({ error: null });
	const update = jest.fn().mockReturnValue({ eq });
	(db.from as jest.Mock).mockReturnValue({ update });
	expect(
		(
			await POST(
				request({ type: "timer_start", duration: 60, endsAt: "fake" }),
				context,
			)
		).status,
	).toBe(200);
	expect(update).toHaveBeenCalledWith(
		expect.objectContaining({
			timer_seconds: 60,
			timer_ends_at: expect.any(String),
		}),
	);
	expect(publish).toHaveBeenCalledWith(
		channel,
		"poker_message",
		expect.objectContaining({ endsAt: expect.not.stringMatching(/^fake$/) }),
	);
	expect(
		(await POST(request({ type: "timer_start", duration: -1 }), context))
			.status,
	).toBe(400);
});

test("streams a poker snapshot and live events, then releases the Redis reader on disconnect", async () => {
	Object.assign(globalThis, { ReadableStream, TextEncoder });
	let release: ((value: null) => void) | undefined;
	const connection = {
		xread: jest
			.fn()
			.mockResolvedValueOnce([
				[
					"stream",
					[
						[
							"2-0",
							[
								"message",
								JSON.stringify({
									event: "poker_message",
									payload: { type: "join" },
								}),
							],
						],
					],
				],
			])
			.mockImplementation(
				() =>
					new Promise((resolve) => {
						release = resolve;
					}),
			),
		disconnect: jest.fn(() => release?.(null)),
	};
	const redis = {
		duplicate: jest.fn(() => connection),
		xrevrange: jest.fn().mockResolvedValue([["1-0", []]]),
		zadd: jest.fn(),
		expire: jest.fn(),
		zremrangebyscore: jest.fn(),
		zrange: jest.fn().mockResolvedValue(["db-user:connection"]),
		zrem: jest.fn().mockResolvedValue(1),
	};
	(getRedis as jest.Mock).mockReturnValue(redis);
	(pokerState as jest.Mock).mockResolvedValue({
		sessionId: member.id,
		participants: [],
	});
	const abort = new AbortController();
	const req = Object.assign(
		createMockRequest(`https://retro.example/api/realtime/${channel}`),
		{ signal: abort.signal },
	);
	const response = await GET(req, context);
	expect(response.headers.get("content-type")).toBe("text/event-stream");
	const reader = (
		response.body as unknown as ReadableStream<Uint8Array>
	).getReader();
	const chunks: string[] = [];
	const decoder = new (await import("node:util")).TextDecoder();
	while (!chunks.some((chunk) => chunk.includes("id: 2-0"))) {
		const chunk = await reader.read();
		chunks.push(decoder.decode(chunk.value));
	}
	abort.abort();
	while (!(await reader.read()).done) {
		/* Drain queued heartbeats. */
	}
	expect(chunks.join("")).toContain('"type":"session_sync"');
	expect(connection.xread).toHaveBeenCalledWith(
		"COUNT",
		100,
		"BLOCK",
		15000,
		"STREAMS",
		`retro:events:${channel}`,
		"1-0",
	);
	expect(connection.disconnect).toHaveBeenCalled();
	expect(redis.zrem).toHaveBeenCalled();
});

test("vote events never publish the estimate", async () => {
	const response = await POST(
		request({
			type: "vote",
			storyId: "11111111-1111-4111-8111-111111111111",
			voteValue: "8",
		}),
		context,
	);
	expect(response.status).toBe(200);
	expect(publish).toHaveBeenCalledWith(
		channel,
		"poker_message",
		expect.not.objectContaining({ voteValue: expect.anything() }),
	);
});
