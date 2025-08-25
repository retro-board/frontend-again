import { supabaseAdmin } from "./admin";

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
		const channel = supabaseAdmin.channel(`board:${boardId}`);
		await channel.send({
			type: "broadcast",
			event,
			payload,
		});
		console.log(`Broadcast sent: ${event} to board:${boardId}`, payload);
	} catch (error) {
		console.error("Failed to broadcast event:", error);
	}
}
