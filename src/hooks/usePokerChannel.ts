import { useUser } from "@clerk/nextjs";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "~/lib/supabase/client";
import { PokerChannelClient } from "~/lib/supabase/poker-channel";
import type {
	PokerChannelMessage,
	PokerSessionState,
} from "~/types/poker-channel";

interface UsePokerChannelOptions {
	sessionId: string;
	isAnonymous?: boolean;
	anonymousUserId?: string;
	onMessage?: (message: PokerChannelMessage) => void;
}

export function usePokerChannel({
	sessionId,
	isAnonymous = false,
	anonymousUserId,
	onMessage,
}: UsePokerChannelOptions) {
	const { user } = useUser();
	const channelRef = useRef<PokerChannelClient | null>(null);
	const [isConnected, setIsConnected] = useState(false);
	const [sessionState, setSessionState] = useState<PokerSessionState>({
		sessionId,
		participants: [],
		stories: [],
		votingState: {
			isVoting: false,
			votesReceived: 0,
			eligibleVoters: 0,
		},
		timer: {
			isActive: false,
		},
	});

	// Handle incoming messages and update state
	const handleChannelMessage = useCallback((message: PokerChannelMessage) => {
		setSessionState((prev) => {
			const newState = { ...prev };

			switch (message.type) {
				case "join": {
					const participantId =
						message.userId || message.anonymousUserId || "unknown";
					const existingIndex = newState.participants.findIndex(
						(p) => p.id === participantId,
					);

					if (existingIndex === -1) {
						newState.participants.push({
							id: participantId,
							name: message.userName,
							isAnonymous: !message.userId,
							role: message.role,
							hasVoted: false,
							isAbstaining: false,
						});
					}

					// Update eligible voters count
					newState.votingState.eligibleVoters = newState.participants.filter(
						(p) => p.role === "voter" && !p.isAbstaining,
					).length;
					break;
				}

				case "leave": {
					const participantId =
						message.userId || message.anonymousUserId || "unknown";
					newState.participants = newState.participants.filter(
						(p) => p.id !== participantId,
					);

					// Update eligible voters count
					newState.votingState.eligibleVoters = newState.participants.filter(
						(p) => p.role === "voter" && !p.isAbstaining,
					).length;
					break;
				}

				case "vote": {
					const participantId =
						message.userId || message.anonymousUserId || "unknown";
					const participant = newState.participants.find(
						(p) => p.id === participantId,
					);
					if (participant && !participant.hasVoted) {
						participant.hasVoted = true;
						newState.votingState.votesReceived++;

						// Check if all eligible voters have voted
						const eligibleVoters = newState.participants.filter(
							(p) => p.role === "voter" && !p.isAbstaining,
						);
						const allVoted = eligibleVoters.every((p) => p.hasVoted);

						if (allVoted && eligibleVoters.length > 0) {
							// Trigger voting completion
							newState.votingState.allVoted = true;
						}
					}
					break;
				}

				case "abstain": {
					const participantId =
						message.userId || message.anonymousUserId || "unknown";
					const participant = newState.participants.find(
						(p) => p.id === participantId,
					);
					if (participant) {
						participant.isAbstaining = true;
						// Update eligible voters count
						newState.votingState.eligibleVoters = newState.participants.filter(
							(p) => p.role === "voter" && !p.isAbstaining,
						).length;
					}
					break;
				}

				case "unabstain": {
					const participantId =
						message.userId || message.anonymousUserId || "unknown";
					const participant = newState.participants.find(
						(p) => p.id === participantId,
					);
					if (participant) {
						participant.isAbstaining = false;
						// Update eligible voters count
						newState.votingState.eligibleVoters = newState.participants.filter(
							(p) => p.role === "voter" && !p.isAbstaining,
						).length;
					}
					break;
				}

				case "timer_start": {
					newState.timer = {
						isActive: true,
						duration: message.duration,
						endsAt: message.endsAt,
					};
					break;
				}

				case "timer_stop": {
					newState.timer = {
						isActive: false,
					};
					break;
				}

				case "story_create": {
					newState.stories.push({
						id: message.story.id,
						title: message.story.title,
						description: message.story.description,
						isEstimated: false,
					});
					break;
				}

				case "story_select": {
					newState.currentStory = {
						id: message.storyId,
						title: message.storyTitle,
					};
					// Reset voting state for new story
					newState.participants.forEach((p) => {
						p.hasVoted = false;
					});
					newState.votingState.votesReceived = 0;
					break;
				}

				case "voting_start": {
					newState.votingState.isVoting = true;
					newState.votingState.votesReceived = 0;
					newState.participants.forEach((p) => {
						p.hasVoted = false;
					});
					break;
				}

				case "voting_end": {
					newState.votingState.isVoting = false;
					break;
				}

				case "score_calculated": {
					const story = newState.stories.find((s) => s.id === message.storyId);
					if (story) {
						story.finalEstimate = message.finalScore;
						story.isEstimated = true;
					}
					// Reset voting state
					newState.votingState.isVoting = false;
					newState.votingState.votesReceived = 0;
					newState.participants.forEach((p) => {
						p.hasVoted = false;
					});
					break;
				}
			}

			return newState;
		});
	}, []);

	// Store onMessage in a ref to avoid re-connecting when it changes
	const onMessageRef = useRef(onMessage);
	useEffect(() => {
		onMessageRef.current = onMessage;
	}, [onMessage]);

	// Initialize channel connection
	useEffect(() => {
		if (!sessionId) return;

		let cleanup: (() => void) | undefined;
		let mounted = true;

		const initChannel = async () => {
			try {
				const channel = new PokerChannelClient(sessionId, supabase);

				if (!mounted) {
					await channel.disconnect();
					return;
				}

				channelRef.current = channel;

				// Set up message handler
				const unsubscribe = channel.onMessage((message) => {
					handleChannelMessage(message);
					onMessageRef.current?.(message);
				});

				// Connect to channel
				await channel.connect(
					isAnonymous ? undefined : user?.id,
					isAnonymous ? anonymousUserId : undefined,
				);

				if (mounted) {
					setIsConnected(true);
				}

				cleanup = () => {
					unsubscribe();
					channel.disconnect();
				};
			} catch (error) {
				console.error("Failed to initialize poker channel:", error);
				if (mounted) {
					setIsConnected(false);
				}
			}
		};

		initChannel();

		return () => {
			mounted = false;
			if (cleanup) cleanup();
			if (channelRef.current) {
				channelRef.current.disconnect();
				channelRef.current = null;
			}
			setIsConnected(false);
		};
	}, [
		sessionId,
		user?.id,
		isAnonymous,
		anonymousUserId,
		handleChannelMessage,
		// Removed onMessage from dependencies - using ref instead
	]);

	// Action methods
	const vote = useCallback(
		async (storyId: string, voteValue: string) => {
			if (!channelRef.current) return;

			await channelRef.current.vote(
				storyId,
				voteValue,
				isAnonymous ? undefined : user?.id,
				isAnonymous ? anonymousUserId : undefined,
				user?.fullName || undefined,
			);
		},
		[user, isAnonymous, anonymousUserId],
	);

	const join = useCallback(
		async (role: "facilitator" | "voter" | "observer") => {
			if (!channelRef.current) return;

			await channelRef.current.join(
				role,
				isAnonymous ? undefined : user?.id,
				isAnonymous ? anonymousUserId : undefined,
				user?.fullName || undefined,
			);
		},
		[user, isAnonymous, anonymousUserId],
	);

	const leave = useCallback(async () => {
		if (!channelRef.current) return;

		await channelRef.current.leave(
			isAnonymous ? undefined : user?.id,
			isAnonymous ? anonymousUserId : undefined,
			user?.fullName || undefined,
		);
	}, [user, isAnonymous, anonymousUserId]);

	const abstain = useCallback(async () => {
		if (!channelRef.current) return;

		await channelRef.current.abstain(
			isAnonymous ? undefined : user?.id,
			isAnonymous ? anonymousUserId : undefined,
			user?.fullName || undefined,
		);
	}, [user, isAnonymous, anonymousUserId]);

	const unabstain = useCallback(async () => {
		if (!channelRef.current) return;

		await channelRef.current.unabstain(
			isAnonymous ? undefined : user?.id,
			isAnonymous ? anonymousUserId : undefined,
			user?.fullName || undefined,
		);
	}, [user, isAnonymous, anonymousUserId]);

	// Facilitator methods
	const startTimer = useCallback(
		async (duration: number) => {
			if (!channelRef.current) return;
			const userId = user?.id || anonymousUserId;
			if (!userId) return;
			await channelRef.current.startTimer(duration, userId);
		},
		[user, anonymousUserId],
	);

	const stopTimer = useCallback(async () => {
		if (!channelRef.current) return;
		const userId = user?.id || anonymousUserId;
		if (!userId) return;
		await channelRef.current.stopTimer(userId);
	}, [user, anonymousUserId]);

	const createStory = useCallback(
		async (story: {
			id: string;
			title: string;
			description?: string;
			position: number;
		}) => {
			if (!channelRef.current) return;
			const userId = user?.id || anonymousUserId;
			if (!userId) return;
			await channelRef.current.createStory(story, userId);
		},
		[user, anonymousUserId],
	);

	const selectStory = useCallback(
		async (storyId: string, storyTitle: string) => {
			if (!channelRef.current) return;
			const userId = user?.id || anonymousUserId;
			if (!userId) return;
			await channelRef.current.selectStory(storyId, storyTitle, userId);
		},
		[user, anonymousUserId],
	);

	const startVoting = useCallback(
		async (storyId: string) => {
			if (!channelRef.current) return;
			const userId = user?.id || anonymousUserId;
			if (!userId) return;
			await channelRef.current.startVoting(storyId, userId);
		},
		[user, anonymousUserId],
	);

	const endVoting = useCallback(
		async (storyId: string) => {
			if (!channelRef.current) return;
			const userId = user?.id || anonymousUserId;
			if (!userId) return;
			await channelRef.current.endVoting(storyId, userId);
		},
		[user, anonymousUserId],
	);

	const announceScore = useCallback(
		async (
			storyId: string,
			finalScore: string,
			votes: Record<string, string>,
		) => {
			if (!channelRef.current) return;
			const userId = user?.id || anonymousUserId;
			if (!userId) return;
			await channelRef.current.announceScore(
				storyId,
				finalScore,
				votes,
				userId,
			);
		},
		[user, anonymousUserId],
	);

	return {
		isConnected,
		sessionState,
		// Common actions
		vote,
		join,
		leave,
		abstain,
		unabstain,
		// Facilitator actions
		startTimer,
		stopTimer,
		createStory,
		selectStory,
		startVoting,
		endVoting,
		announceScore,
	};
}
