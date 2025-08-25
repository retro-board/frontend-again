import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { PokerChannelMessage } from "~/types/poker-channel";

export class PokerChannelClient {
	private channel: RealtimeChannel | null = null;
	private sessionId: string;
	private supabase: SupabaseClient;
	private messageHandlers: Map<string, (message: PokerChannelMessage) => void> =
		new Map();
	private presenceHandlers: Map<
		string,
		(state: Record<string, unknown>) => void
	> = new Map();

	constructor(sessionId: string, supabaseClient: SupabaseClient) {
		this.sessionId = sessionId;
		this.supabase = supabaseClient;
	}

	async connect(userId?: string, anonymousUserId?: string) {
		if (this.channel) {
			await this.disconnect();
		}

		const channelName = `poker:${this.sessionId}`;
		this.channel = this.supabase.channel(channelName, {
			config: {
				presence: {
					key: userId || anonymousUserId || "anonymous",
				},
				broadcast: {
					self: true, // Include messages sent by this client
				},
			},
		});

		// Set up message broadcasting
		this.channel.on("broadcast", { event: "poker_message" }, (payload) => {
			const message = payload.payload as PokerChannelMessage;
			this.handleMessage(message);
		});

		// Set up presence sync
		this.channel.on("presence", { event: "sync" }, () => {
			const state = this.channel?.presenceState();
			if (state) {
				this.handlePresenceSync(state);
			}
		});

		// Subscribe to the channel
		await this.channel.subscribe();

		// Track presence
		if (userId || anonymousUserId) {
			await this.channel.track({
				userId: userId || undefined,
				anonymousUserId: anonymousUserId || undefined,
				online_at: new Date().toISOString(),
			});
		}

		return this.channel;
	}

	async disconnect() {
		if (this.channel) {
			await this.channel.unsubscribe();
			this.channel = null;
		}
	}

	// Send a message to all participants
	async sendMessage(message: PokerChannelMessage) {
		if (!this.channel) {
			throw new Error("Channel not connected");
		}

		await this.channel.send({
			type: "broadcast",
			event: "poker_message",
			payload: message,
		});
	}

	// Register a handler for messages
	onMessage(handler: (message: PokerChannelMessage) => void): () => void {
		const id = Math.random().toString(36);
		this.messageHandlers.set(id, handler);
		return () => this.messageHandlers.delete(id);
	}

	// Register a handler for presence updates
	onPresenceSync(
		handler: (state: Record<string, unknown>) => void,
	): () => void {
		const id = Math.random().toString(36);
		this.presenceHandlers.set(id, handler);
		return () => this.presenceHandlers.delete(id);
	}

	private handleMessage(message: PokerChannelMessage) {
		for (const handler of this.messageHandlers.values()) {
			handler(message);
		}
	}

	private handlePresenceSync(state: Record<string, unknown>) {
		for (const handler of this.presenceHandlers.values()) {
			handler(state);
		}
	}

	// Helper methods for specific message types
	async vote(
		storyId: string,
		voteValue: string,
		userId?: string,
		anonymousUserId?: string,
		userName?: string,
	) {
		await this.sendMessage({
			type: "vote",
			sessionId: this.sessionId,
			storyId,
			voteValue,
			userId,
			anonymousUserId,
			userName,
			timestamp: new Date().toISOString(),
		});
	}

	async join(
		role: "facilitator" | "voter" | "observer",
		userId?: string,
		anonymousUserId?: string,
		userName?: string,
	) {
		await this.sendMessage({
			type: "join",
			sessionId: this.sessionId,
			role,
			userId,
			anonymousUserId,
			userName,
			timestamp: new Date().toISOString(),
		});
	}

	async leave(userId?: string, anonymousUserId?: string, userName?: string) {
		await this.sendMessage({
			type: "leave",
			sessionId: this.sessionId,
			userId,
			anonymousUserId,
			userName,
			timestamp: new Date().toISOString(),
		});
	}

	async abstain(userId?: string, anonymousUserId?: string, userName?: string) {
		await this.sendMessage({
			type: "abstain",
			sessionId: this.sessionId,
			userId,
			anonymousUserId,
			userName,
			timestamp: new Date().toISOString(),
		});
	}

	async unabstain(
		userId?: string,
		anonymousUserId?: string,
		userName?: string,
	) {
		await this.sendMessage({
			type: "unabstain",
			sessionId: this.sessionId,
			userId,
			anonymousUserId,
			userName,
			timestamp: new Date().toISOString(),
		});
	}

	// Facilitator-only methods
	async startTimer(duration: number, userId: string) {
		const endsAt = new Date(Date.now() + duration * 1000).toISOString();
		await this.sendMessage({
			type: "timer_start",
			sessionId: this.sessionId,
			userId,
			duration,
			endsAt,
			timestamp: new Date().toISOString(),
		});
	}

	async stopTimer(userId: string) {
		await this.sendMessage({
			type: "timer_stop",
			sessionId: this.sessionId,
			userId,
			timestamp: new Date().toISOString(),
		});
	}

	async createStory(
		story: {
			id: string;
			title: string;
			description?: string;
			position: number;
		},
		userId: string,
	) {
		await this.sendMessage({
			type: "story_create",
			sessionId: this.sessionId,
			userId,
			story,
			timestamp: new Date().toISOString(),
		});
	}

	async selectStory(storyId: string, storyTitle: string, userId: string) {
		await this.sendMessage({
			type: "story_select",
			sessionId: this.sessionId,
			userId,
			storyId,
			storyTitle,
			timestamp: new Date().toISOString(),
		});
	}

	async startVoting(storyId: string, userId: string) {
		await this.sendMessage({
			type: "voting_start",
			sessionId: this.sessionId,
			userId,
			storyId,
			timestamp: new Date().toISOString(),
		});
	}

	async endVoting(storyId: string, userId: string) {
		await this.sendMessage({
			type: "voting_end",
			sessionId: this.sessionId,
			userId,
			storyId,
			timestamp: new Date().toISOString(),
		});
	}

	async announceScore(
		storyId: string,
		finalScore: string,
		votes: Record<string, string>,
		userId: string,
	) {
		await this.sendMessage({
			type: "score_calculated",
			sessionId: this.sessionId,
			userId,
			storyId,
			finalScore,
			votes,
			timestamp: new Date().toISOString(),
		});
	}
}
