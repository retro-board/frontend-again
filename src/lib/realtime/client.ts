// The channel interface is shared by the browser SSE transport and server publisher.
export type ChannelEnvelope = {
	// biome-ignore lint/suspicious/noExplicitAny: Existing event handlers validate their domain payloads.
	payload: any;
};
export interface RealtimeChannel {
	on(
		kind: string,
		filter: { event: string; schema?: string; table?: string },
		handler: (message: ChannelEnvelope) => void,
	): RealtimeChannel;
	subscribe(): Promise<unknown>;
	unsubscribe(): Promise<unknown>;
	send(message: {
		type: string;
		event: string;
		payload: unknown;
	}): Promise<unknown>;
	track(state: Record<string, unknown>): Promise<unknown>;
	presenceState(): Record<string, unknown>;
}
export interface RealtimeClient {
	channel(name: string, options?: unknown): RealtimeChannel;
	removeChannel(channel: RealtimeChannel): Promise<unknown>;
}

class SSEChannel implements RealtimeChannel {
	private source?: EventSource;
	private handlers: {
		kind: string;
		event: string;
		handler: (message: ChannelEnvelope) => void;
	}[] = [];
	private presence: Record<string, unknown> = {};
	constructor(private name: string) {}
	on(
		kind: string,
		filter: { event: string },
		handler: (message: ChannelEnvelope) => void,
	) {
		this.handlers.push({ kind, event: filter.event, handler });
		return this;
	}
	subscribe() {
		this.source?.close();
		const source = new EventSource(
			`/api/realtime/${encodeURIComponent(this.name)}`,
		);
		this.source = source;
		source.onmessage = (event) => {
			const message = JSON.parse(event.data);
			if (message.event === "presence") this.presence = message.payload;
			for (const entry of this.handlers) {
				if (
					(entry.kind === "broadcast" && entry.event === message.event) ||
					(entry.kind === "presence" && message.event === "presence")
				)
					entry.handler({ payload: message.payload });
			}
		};
		// Refetch persistent board/session state after every connection, including reconnects.
		source.onopen = () => window.dispatchEvent(new Event("realtime-connected"));
		return new Promise<void>((resolve, reject) => {
			source.addEventListener("open", () => resolve(), { once: true });
			source.addEventListener(
				"error",
				() => reject(new Error("Realtime connection failed")),
				{ once: true },
			);
		});
	}
	async unsubscribe() {
		this.source?.close();
		this.source = undefined;
	}
	async send(message: { event: string; payload: unknown }) {
		const response = await fetch(
			`/api/realtime/${encodeURIComponent(this.name)}`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(message),
			},
		);
		if (!response.ok) throw new Error("Realtime message rejected");
	}
	async track(_state: Record<string, unknown>) {
		/* Presence comes from the authenticated stream. */
	}
	presenceState() {
		return this.presence;
	}
}
export const realtime: RealtimeClient = {
	channel: (name) => new SSEChannel(name),
	removeChannel: (channel) => channel.unsubscribe(),
};
