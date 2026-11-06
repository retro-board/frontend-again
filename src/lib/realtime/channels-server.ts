import { reportError } from "~/lib/bugfixes";
import { publish } from "./server";

// Re-export types from client for convenience
export type {
	CardEventPayload,
	ChannelEvent,
	CombineCardsPayload,
	HighlightCardPayload,
	PhaseEventPayload,
	TimerEventPayload,
} from "./channels-client";

// Server-side broadcasting
export async function broadcastToBoard(
	boardId: string,
	event: string,
	payload: unknown,
) {
	// Skip broadcasting in test environment
	if (process.env.NODE_ENV === "test") {
		return;
	}

	try {
		await publish(`board:${boardId}`, event, payload);
	} catch (error) {
		reportError("Failed to publish board event", error);
	}
}
