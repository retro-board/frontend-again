import Redis from "ioredis";
import { privatePokerEvent } from "~/lib/poker/vote-privacy";
import type { RealtimeChannel, RealtimeClient } from "./client";

let redis: Redis | undefined;
export function getRedis() {
	if (!process.env.REDIS_URL) throw new Error("REDIS_URL is required");
	redis ??= new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 2 });
	return redis;
}
export const eventsKey = (channel: string) => `retro:events:${channel}`;
export async function publish(
	channel: string,
	event: string,
	payload: unknown,
) {
	if (process.env.NODE_ENV === "test") return;
	const key = eventsKey(channel);
	await getRedis()
		.multi()
		.xadd(
			key,
			"MAXLEN",
			"~",
			1000,
			"*",
			"message",
			JSON.stringify(privatePokerEvent({ event, payload })),
		)
		.expire(key, 43200)
		.exec()
		.then((results) => {
			const error = results?.find(([err]) => err)?.[0];
			if (error) throw error;
		});
}

// Server API mutations publish directly; they never open a browser-style subscription.
class Publisher implements RealtimeChannel {
	constructor(private name: string) {}
	on() {
		return this;
	}
	async subscribe() {}
	async unsubscribe() {}
	async track() {}
	presenceState() {
		return {};
	}
	async send(message: { event: string; payload: unknown }) {
		await publish(this.name, message.event, message.payload);
	}
}
export const serverRealtime: RealtimeClient = {
	channel: (name) => new Publisher(name),
	removeChannel: (channel) => channel.unsubscribe(),
};
