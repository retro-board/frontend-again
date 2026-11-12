import { privatePokerEvent, publicPokerVotes } from "./vote-privacy";

const votes = [
	{ user_id: "me", vote_value: "3" },
	{ user_id: "other", vote_value: "8" },
	{ anonymous_user_id: "guest", vote_value: "5" },
];
it("only includes the caller's estimate before reveal", () => {
	expect(publicPokerVotes(votes, false, "me")).toEqual([
		votes[0],
		{ user_id: "other" },
		{ anonymous_user_id: "guest" },
	]);
});
it("recognizes anonymous cookie identities", () => {
	expect(publicPokerVotes(votes, false, "guest", true)).toEqual([
		{ user_id: "me" },
		{ user_id: "other" },
		votes[2],
	]);
});
it("shows all estimates after reveal", () => {
	expect(publicPokerVotes(votes, true)).toEqual(votes);
});
it("strips estimates from live and replayed vote events", () => {
	expect(
		privatePokerEvent({
			event: "poker_message",
			payload: {
				type: "vote",
				storyId: "story",
				voteValue: "8",
				userId: "other",
			},
		}),
	).toEqual({
		event: "poker_message",
		payload: { type: "vote", storyId: "story", userId: "other" },
	});
});
