import type { RealtimeChannel } from "@supabase/supabase-js";

// Channel event types
export type ChannelEvent =
	| "card_created"
	| "card_updated"
	| "card_deleted"
	| "cards_combined"
	| "card_highlighted"
	| "timer_started"
	| "timer_paused"
	| "timer_resumed"
	| "timer_extended"
	| "phase_changed"
	| "board_updated"
	| "vote_added"
	| "vote_removed";

export interface CardEventPayload {
	cardId: string;
	columnId: string;
	userId?: string;
	content?: string;
	position?: number;
	isAnonymous?: boolean;
}

export interface TimerEventPayload {
	action: "start" | "pause" | "resume" | "extend";
	duration?: number;
	remainingTime?: number;
}

export interface PhaseEventPayload {
	previousPhase: string;
	newPhase: string;
}

export interface CombineCardsPayload {
	sourceCardIds: string[];
	targetCardId: string;
	newContent: string;
}

export interface HighlightCardPayload {
	cardId: string;
	duration?: number; // Duration in seconds for discussion
}

// Client-side channel management
export class BoardChannel {
	private channel: RealtimeChannel | null = null;
	private boardId: string;
	// biome-ignore lint/suspicious/noExplicitAny: Supabase client type is complex and varies
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private supabase: any;

	// biome-ignore lint/suspicious/noExplicitAny: Supabase client type is complex and varies
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	constructor(boardId: string, supabaseClient: any) {
		this.boardId = boardId;
		this.supabase = supabaseClient;
	}

	subscribe(handlers: {
		onCardCreated?: (payload: CardEventPayload) => void;
		onCardUpdated?: (payload: CardEventPayload) => void;
		onCardDeleted?: (payload: { cardId: string }) => void;
		onCardsCombined?: (payload: CombineCardsPayload) => void;
		onCardHighlighted?: (payload: HighlightCardPayload) => void;
		onTimerEvent?: (payload: TimerEventPayload) => void;
		onPhaseChanged?: (payload: PhaseEventPayload) => void;
		onBoardUpdated?: (payload: unknown) => void;
	}) {
		this.channel = this.supabase.channel(`board:${this.boardId}`);

		// Subscribe to card events
		if (handlers.onCardCreated && this.channel) {
			this.channel.on("broadcast", { event: "card_created" }, ({ payload }) =>
				handlers.onCardCreated?.(payload),
			);
		}

		if (handlers.onCardUpdated && this.channel) {
			this.channel.on("broadcast", { event: "card_updated" }, ({ payload }) =>
				handlers.onCardUpdated?.(payload),
			);
		}

		if (handlers.onCardDeleted && this.channel) {
			this.channel.on("broadcast", { event: "card_deleted" }, ({ payload }) =>
				handlers.onCardDeleted?.(payload),
			);
		}

		if (handlers.onCardsCombined && this.channel) {
			this.channel.on("broadcast", { event: "cards_combined" }, ({ payload }) =>
				handlers.onCardsCombined?.(payload),
			);
		}

		if (handlers.onCardHighlighted && this.channel) {
			this.channel.on(
				"broadcast",
				{ event: "card_highlighted" },
				({ payload }) => handlers.onCardHighlighted?.(payload),
			);
		}

		// Subscribe to timer events
		if (handlers.onTimerEvent && this.channel) {
			const timerEvents = [
				"timer_started",
				"timer_paused",
				"timer_resumed",
				"timer_extended",
			];
			for (const event of timerEvents) {
				this.channel.on("broadcast", { event }, ({ payload }) =>
					handlers.onTimerEvent?.(payload),
				);
			}
		}

		// Subscribe to phase changes
		if (handlers.onPhaseChanged && this.channel) {
			this.channel.on("broadcast", { event: "phase_changed" }, ({ payload }) =>
				handlers.onPhaseChanged?.(payload),
			);
		}

		// Subscribe to board updates
		if (handlers.onBoardUpdated && this.channel) {
			this.channel.on("broadcast", { event: "board_updated" }, ({ payload }) =>
				handlers.onBoardUpdated?.(payload),
			);
		}

		// Subscribe to database changes as fallback
		if (this.channel) {
			this.channel
				.on(
					"postgres_changes",
					{
						event: "*",
						schema: "public",
						table: "cards",
					},
					(payload) => {
						// Only log in development
						if (process.env.NODE_ENV === "development") {
							console.log("Database change:", payload);
						}
					},
				)
				.subscribe();
		}

		return this;
	}

	// Send events from client
	async sendEvent(event: ChannelEvent, payload: unknown) {
		if (!this.channel) {
			console.error("Channel not initialized");
			return;
		}

		await this.channel.send({
			type: "broadcast",
			event,
			payload,
		});
	}

	unsubscribe() {
		if (this.channel) {
			this.supabase.removeChannel(this.channel);
			this.channel = null;
		}
	}
}
