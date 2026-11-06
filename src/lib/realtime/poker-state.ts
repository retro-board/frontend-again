import { db } from "~/lib/db";
import type { PokerSessionState } from "~/types/poker-channel";

// Persistent state lets late joiners and reconnecting clients recover without replaying old actions.
export async function pokerState(
	sessionId: string,
): Promise<PokerSessionState> {
	const { data: session, error } = await db
		.from("poker_sessions")
		.select(`
		*, stories(*, votes:poker_votes(user_id, anonymous_user_id)),
		participants:poker_participants(*, user:users(name)),
		anonymous_participants:poker_anonymous_participants(*, anonymous_user:anonymous_users(display_name))
	`)
		.eq("id", sessionId)
		.single();
	if (error || !session) throw new Error("Failed to load poker state");
	const story = session.stories.find(
		(row: { id: string }) => row.id === session.current_story_id,
	);
	const voted = new Set<string>(
		(story?.votes ?? []).map(
			(vote: { user_id?: string; anonymous_user_id?: string }) =>
				vote.user_id ?? vote.anonymous_user_id,
		),
	);
	const participants: PokerSessionState["participants"] = [
		...session.participants.map(
			(row: {
				user_id: string;
				user: { name?: string };
				role: "facilitator" | "voter" | "observer";
				is_abstaining: boolean;
			}) => ({
				id: row.user_id,
				name: row.user?.name,
				role: row.role,
				isAnonymous: false,
				hasVoted: voted.has(row.user_id),
				isAbstaining: row.is_abstaining,
			}),
		),
		...session.anonymous_participants.map(
			(row: {
				anonymous_user_id: string;
				anonymous_user: { display_name: string };
				is_abstaining: boolean;
			}) => ({
				id: row.anonymous_user_id,
				name: row.anonymous_user?.display_name,
				role: "voter" as const,
				isAnonymous: true,
				hasVoted: voted.has(row.anonymous_user_id),
				isAbstaining: row.is_abstaining,
			}),
		),
	];
	const eligible = participants.filter(
		(person) => person.role === "voter" && !person.isAbstaining,
	);
	return {
		sessionId,
		participants,
		currentStory: story
			? { id: story.id, title: story.title, description: story.description }
			: undefined,
		stories: session.stories.map(
			(row: {
				id: string;
				title: string;
				description?: string;
				final_estimate?: string;
				is_estimated: boolean;
			}) => ({
				id: row.id,
				title: row.title,
				description: row.description,
				finalEstimate: row.final_estimate,
				isEstimated: row.is_estimated,
			}),
		),
		votingState: {
			isVoting: session.is_voting,
			votesReceived: eligible.filter((person) => person.hasVoted).length,
			eligibleVoters: eligible.length,
			allVoted:
				eligible.length > 0 && eligible.every((person) => person.hasVoted),
		},
		timer: {
			isActive:
				!!session.timer_ends_at &&
				new Date(session.timer_ends_at).getTime() > Date.now(),
			endsAt: session.timer_ends_at
				? new Date(session.timer_ends_at).toISOString()
				: undefined,
			duration: session.timer_seconds,
		},
	};
}
