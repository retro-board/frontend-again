import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { usePokerChannel } from "./usePokerChannel";
import { usePokerTimer } from "./usePokerTimer";

interface UsePokerVotingOptions {
	sessionId: string;
	isAnonymous?: boolean;
	anonymousUserId?: string;
	isFacilitator?: boolean;
	onVotingComplete?: (storyId: string, finalScore: string) => void;
}

export function usePokerVoting({
	sessionId,
	isAnonymous = false,
	anonymousUserId,
	isFacilitator = false,
	onVotingComplete,
}: UsePokerVotingOptions) {
	const [isVoting, setIsVoting] = useState(false);
	const [currentStoryId, setCurrentStoryId] = useState<string | null>(null);
	const [hasVoted, setHasVoted] = useState(false);
	const [isAbstaining, setIsAbstaining] = useState(false);

	// Initialize channel
	const {
		isConnected,
		sessionState,
		vote: sendVote,
		abstain: sendAbstain,
		unabstain: sendUnabstain,
		startTimer: channelStartTimer,
		stopTimer: channelStopTimer,
		selectStory: channelSelectStory,
		startVoting: channelStartVoting,
		endVoting: channelEndVoting,
		announceScore: channelAnnounceScore,
	} = usePokerChannel({
		sessionId,
		isAnonymous,
		anonymousUserId,
		onMessage: (message) => {
			// Handle voting-specific messages
			switch (message.type) {
				case "voting_start":
					setIsVoting(true);
					setCurrentStoryId(message.storyId);
					setHasVoted(false);
					break;
				case "voting_end":
					setIsVoting(false);
					break;
				case "story_select":
					setCurrentStoryId(message.storyId);
					setHasVoted(false);
					break;
				case "score_calculated":
					onVotingComplete?.(message.storyId, message.finalScore);
					toast.success(`Story estimated: ${message.finalScore}`);
					break;
			}
		},
	});

	// Timer for voting
	const timer = usePokerTimer({
		onExpire: useCallback(async () => {
			if (isFacilitator && currentStoryId) {
				// Auto-end voting when timer expires
				await endVoting(currentStoryId);
			}
		}, [isFacilitator, currentStoryId]),
	});

	// Check voting completion
	const checkVotingCompletion = useCallback(async () => {
		if (!currentStoryId || !isFacilitator) return;

		const response = await fetch(
			`/api/poker/${sessionId}/voting?storyId=${currentStoryId}`,
		);
		if (response.ok) {
			const data = await response.json();

			if (data.shouldEndVoting) {
				await endVoting(currentStoryId);
			}
		}
	}, [sessionId, currentStoryId, isFacilitator]);

	// Submit a vote
	const submitVote = useCallback(
		async (voteValue: string) => {
			if (!currentStoryId || hasVoted) return;

			try {
				// Send vote to server
				const response = await fetch(`/api/poker/${sessionId}/votes`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						storyId: currentStoryId,
						voteValue,
						anonymousUserId: isAnonymous ? anonymousUserId : undefined,
					}),
				});

				if (!response.ok) {
					throw new Error("Failed to submit vote");
				}

				// Broadcast vote to channel
				await sendVote(currentStoryId, voteValue);
				setHasVoted(true);

				// Check if voting is complete
				setTimeout(checkVotingCompletion, 500);
			} catch (error) {
				console.error("Vote submission error:", error);
				toast.error("Failed to submit vote");
			}
		},
		[
			sessionId,
			currentStoryId,
			hasVoted,
			isAnonymous,
			anonymousUserId,
			sendVote,
			checkVotingCompletion,
		],
	);

	// Toggle abstention
	const toggleAbstention = useCallback(async () => {
		try {
			const newState = !isAbstaining;

			// Update server
			const response = await fetch(`/api/poker/${sessionId}/abstain`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					isAbstaining: newState,
					anonymousUserId: isAnonymous ? anonymousUserId : undefined,
				}),
			});

			if (!response.ok) {
				throw new Error("Failed to update abstention");
			}

			// Broadcast to channel
			if (newState) {
				await sendAbstain();
			} else {
				await sendUnabstain();
			}

			setIsAbstaining(newState);
		} catch (error) {
			console.error("Abstention error:", error);
			toast.error("Failed to update abstention");
		}
	}, [
		sessionId,
		isAbstaining,
		isAnonymous,
		anonymousUserId,
		sendAbstain,
		sendUnabstain,
	]);

	// Facilitator: Start voting on a story
	const startVoting = useCallback(
		async (storyId: string, timerDuration?: number) => {
			if (!isFacilitator) return;

			try {
				// Start voting on server
				const response = await fetch(`/api/poker/${sessionId}/voting`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						action: "start",
						storyId,
						timerDuration,
					}),
				});

				if (!response.ok) {
					throw new Error("Failed to start voting");
				}

				// Broadcast to channel
				await channelSelectStory(storyId, ""); // TODO: Get story title
				await channelStartVoting(storyId);

				if (timerDuration) {
					timer.start(timerDuration);
					await channelStartTimer(timerDuration);
				}

				setIsVoting(true);
				setCurrentStoryId(storyId);
			} catch (error) {
				console.error("Start voting error:", error);
				toast.error("Failed to start voting");
			}
		},
		[
			sessionId,
			isFacilitator,
			channelSelectStory,
			channelStartVoting,
			channelStartTimer,
			timer,
		],
	);

	// Facilitator: End voting and calculate score
	const endVoting = useCallback(
		async (storyId: string) => {
			if (!isFacilitator) return;

			try {
				// End voting on server
				await fetch(`/api/poker/${sessionId}/voting`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						action: "end",
						storyId,
					}),
				});

				// Calculate score
				const scoreResponse = await fetch(`/api/poker/${sessionId}/score`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ storyId }),
				});

				if (!scoreResponse.ok) {
					throw new Error("Failed to calculate score");
				}

				const { finalScore, votes } = await scoreResponse.json();

				// Broadcast results
				await channelEndVoting(storyId);
				await channelAnnounceScore(storyId, finalScore, votes);

				// Stop timer if active
				if (timer.isActive) {
					timer.stop();
					await channelStopTimer();
				}

				setIsVoting(false);
			} catch (error) {
				console.error("End voting error:", error);
				toast.error("Failed to end voting");
			}
		},
		[
			sessionId,
			isFacilitator,
			channelEndVoting,
			channelAnnounceScore,
			channelStopTimer,
			timer,
		],
	);

	// Monitor voting state changes
	useEffect(() => {
		if (sessionState.timer.isActive && sessionState.timer.endsAt) {
			timer.startUntil(sessionState.timer.endsAt);
		} else if (!sessionState.timer.isActive && timer.isActive) {
			timer.stop();
		}
	}, [sessionState.timer, timer]);

	return {
		// State
		isConnected,
		isVoting,
		currentStoryId,
		hasVoted,
		isAbstaining,
		sessionState,
		timer: {
			isActive: timer.isActive,
			timeRemaining: timer.timeRemaining,
			formattedTime: timer.formattedTime,
		},

		// Actions
		submitVote,
		toggleAbstention,

		// Facilitator actions
		startVoting,
		endVoting,
	};
}
