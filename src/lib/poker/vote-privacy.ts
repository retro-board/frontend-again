type Vote = {
	user_id?: string;
	anonymous_user_id?: string;
	vote_value?: string;
};

export function publicPokerVotes<T extends Vote>(
	votes: T[],
	revealed: boolean,
	viewerId?: string,
	anonymous = false,
) {
	return votes.map((vote) => {
		const own =
			!!viewerId &&
			(anonymous ? vote.anonymous_user_id : vote.user_id) === viewerId;
		if (revealed || own) return vote;
		const { vote_value: _value, ...safe } = vote;
		return safe;
	});
}

// Transient vote messages convey participation only, including events already in Redis.
export function privatePokerEvent(event: {
	event?: string;
	payload?: unknown;
}) {
	const payload = event.payload as Record<string, unknown> | undefined;
	if (event.event !== "poker_message" || payload?.type !== "vote") return event;
	const { voteValue: _value, ...safe } = payload;
	return { ...event, payload: safe };
}
