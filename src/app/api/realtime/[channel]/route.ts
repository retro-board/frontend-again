import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { reportError } from "~/lib/bugfixes";
import { db } from "~/lib/db";
import { privatePokerEvent } from "~/lib/poker/vote-privacy";
import { authorizeChannel } from "~/lib/realtime/authorize";
import { pokerMessage } from "~/lib/realtime/messages";
import { pokerState } from "~/lib/realtime/poker-state";
import { eventsKey, getRedis, publish } from "~/lib/realtime/server";
import { sameOrigin } from "~/lib/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ channel: string }> };

export async function GET(request: Request, context: Context) {
	const { channel } = await context.params;
	const identity = await authorizeChannel(channel);
	if (!identity)
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	const redis = getRedis();
	const key = eventsKey(channel);
	const lastId = request.headers.get("last-event-id");
	const latest = await redis.xrevrange(key, "+", "-", "COUNT", 1);
	let cursor =
		identity.kind !== "poker" && lastId && /^\d+-\d+$/.test(lastId)
			? lastId
			: (latest[0]?.[0] ?? "0-0");
	const snapshot =
		identity.kind === "poker" ? await pokerState(identity.id ?? "") : undefined;
	const reader = redis.duplicate();
	const connectionId = randomUUID();
	const presenceKey = `retro:presence:${channel}`;
	const encoder = new TextEncoder();
	let closed = request.signal.aborted;
	const close = () => {
		closed = true;
		reader.disconnect();
	};
	request.signal.addEventListener("abort", close, { once: true });
	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			const emit = (data: unknown, id?: string) => {
				if (!closed)
					controller.enqueue(
						encoder.encode(
							`${id ? `id: ${id}\n` : ""}data: ${JSON.stringify(data)}\n\n`,
						),
					);
			};
			try {
				emit({ event: "connected", payload: {} });
				if (snapshot)
					emit({
						event: "poker_message",
						payload: {
							type: "session_sync",
							sessionId: identity.id,
							state: snapshot,
							timestamp: new Date().toISOString(),
						},
					});
				let checkedAt = Date.now();
				while (!closed) {
					// Recheck access on long-running streams, including anonymous sessions.
					if (Date.now() - checkedAt > 60000) {
						if (!(await authorizeChannel(channel))) break;
						checkedAt = Date.now();
					}
					await redis.zadd(
						presenceKey,
						Date.now(),
						`${identity.user.id}:${connectionId}`,
					);
					await redis.expire(presenceKey, 60);
					await redis.zremrangebyscore(
						presenceKey,
						"-inf",
						String(Date.now() - 45000),
					);
					const members = await redis.zrange(presenceKey, "0", "-1");
					const state: Record<string, unknown[]> = {};
					for (const member of members) {
						const userId = member.split(":")[0] ?? member;
						state[userId] ??= [];
						state[userId].push({ online: true });
					}
					emit({ event: "presence", payload: state });
					const entries = (await reader.xread(
						"COUNT",
						100,
						"BLOCK",
						15000,
						"STREAMS",
						key,
						cursor,
					)) as [string, [string, string[]][]][] | null;
					for (const [, messages] of entries ?? []) {
						for (const [id, fields] of messages) {
							cursor = id;
							emit(privatePokerEvent(JSON.parse(fields[1] ?? "{}")), id);
						}
					}
					if (!closed) controller.enqueue(encoder.encode(": heartbeat\n\n"));
				}
			} catch (error) {
				if (!closed) reportError("Realtime stream failed", error);
			} finally {
				close();
				request.signal.removeEventListener("abort", close);
				await redis
					.zrem(presenceKey, `${identity.user.id}:${connectionId}`)
					.catch(() => {});
				try {
					controller.close();
				} catch {
					/* Already cancelled. */
				}
			}
		},
		cancel: close,
	});
	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache, no-transform",
			"X-Accel-Buffering": "no",
		},
	});
}

export async function POST(request: Request, context: Context) {
	// request.url is the internal address behind the proxy: compare the public host instead
	if (!sameOrigin(request))
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	const { channel } = await context.params;
	const identity = await authorizeChannel(channel);
	if (identity?.kind !== "poker")
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	const raw = await request.text();
	if (raw.length > 16000)
		return NextResponse.json({ error: "Message too large" }, { status: 413 });
	let body: { event?: string; payload?: Record<string, unknown> };
	try {
		body = JSON.parse(raw);
	} catch {
		return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
	}
	let payload = body?.payload;
	const participantEvents = ["join", "leave", "vote", "abstain", "unabstain"];
	const hostEvents = [
		"timer_start",
		"timer_stop",
		"story_create",
		"story_select",
		"voting_start",
		"voting_end",
		"score_calculated",
	];
	const type = typeof payload?.type === "string" ? payload.type : "";
	if (
		body?.event !== "poker_message" ||
		!payload ||
		![...participantEvents, ...hostEvents].includes(type)
	)
		return NextResponse.json({ error: "Invalid message" }, { status: 400 });
	if (hostEvents.includes(type) && identity.role !== "facilitator")
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	if (
		["vote", "abstain", "unabstain"].includes(type) &&
		identity.role === "observer"
	)
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	const parsed = pokerMessage.safeParse(payload);
	if (!parsed.success)
		return NextResponse.json(
			{ error: "Invalid message payload" },
			{ status: 400 },
		);
	payload = parsed.data;
	// Vote events announce participation; estimates are read after reveal.
	if (type === "vote") delete payload.voteValue;
	// Keep transient controls in PostgreSQL so new streams can restore a complete session.
	const updates: Record<string, unknown> = {};
	if (type === "timer_start") {
		if (
			typeof payload.duration !== "number" ||
			!Number.isFinite(payload.duration) ||
			payload.duration <= 0 ||
			payload.duration > 86400
		)
			return NextResponse.json(
				{ error: "Invalid timer duration" },
				{ status: 400 },
			);
		updates.timer_seconds = payload.duration;
		updates.timer_started_at = new Date().toISOString();
		updates.timer_ends_at = new Date(
			Date.now() + payload.duration * 1000,
		).toISOString();
		payload.endsAt = updates.timer_ends_at;
	}
	if (type === "timer_stop") {
		updates.timer_started_at = null;
		updates.timer_ends_at = null;
	}
	if (type === "voting_start") updates.is_voting = true;
	if (type === "voting_end" || type === "score_calculated")
		updates.is_voting = false;
	if (Object.keys(updates).length) {
		const { error } = await db
			.from("poker_sessions")
			.update(updates)
			.eq("id", identity.id);
		if (error)
			return NextResponse.json(
				{ error: "Failed to save session state" },
				{ status: 500 },
			);
	}
	if (type === "abstain" || type === "unabstain") {
		const { error } = await db
			.from(
				identity.anonymous
					? "poker_anonymous_participants"
					: "poker_participants",
			)
			.update({ is_abstaining: type === "abstain" })
			.eq("session_id", identity.id)
			.eq(
				identity.anonymous ? "anonymous_user_id" : "user_id",
				identity.user.id,
			);
		if (error)
			return NextResponse.json(
				{ error: "Failed to save abstention" },
				{ status: 500 },
			);
	}
	await publish(channel, "poker_message", {
		...payload,
		sessionId: identity.id,
		userId: identity.anonymous ? undefined : identity.user.id,
		anonymousUserId: identity.anonymous ? identity.user.id : undefined,
		userName: identity.user.name ?? identity.user.display_name,
		...(type === "join" ? { role: identity.role } : {}),
		timestamp: new Date().toISOString(),
	});
	return NextResponse.json({ ok: true });
}
