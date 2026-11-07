"use client";

import { useUser } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	Check,
	CheckCircle2,
	ChevronRight,
	Copy,
	Eye,
	EyeOff,
	Plus,
	Share2,
	Timer,
	Trophy,
} from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { Markdown } from "~/components/Markdown";
import { usePaged } from "~/components/Pager";
import { LabelFilter } from "~/components/poker/LabelFilter";
import { ParticipantList } from "~/components/poker/ParticipantList";
import { TracklinesPlanning } from "~/components/poker/TracklinesPlanning";
import { TracklinesStory } from "~/components/poker/TracklinesStory";
import { VoteCard } from "~/components/poker/VoteCard";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { usePokerChannel } from "~/hooks/usePokerChannel";
import { usePokerTimer } from "~/hooks/usePokerTimer";
import { useUserSync } from "~/hooks/useUserSync";
import {
	mostCommon,
	RESULT_METHOD_LABELS,
	RESULT_METHODS,
	type ResultMethod,
} from "~/lib/poker/score";
import { hasLabel } from "~/lib/tracklines/client";
import type {
	AnonymousUser,
	PokerSession,
	PokerVote,
	Story,
	User,
} from "~/types/database";
import { ESTIMATION_VALUES } from "~/types/database";

interface SessionData extends PokerSession {
	stories: (Story & {
		votes: (PokerVote & { user?: User; anonymous_user?: AnonymousUser })[];
	})[];
	participants: {
		user: User;
		role: string;
	}[];
	anonymous_participants?: {
		anonymous_user: AnonymousUser;
	}[];
	status?: "active" | "completed";
}

export default function PokerSessionPage() {
	const params = useParams();
	const sessionId = params.sessionId as string;
	const { user, isLoaded } = useUser();
	const { syncedUser } = useUserSync();
	const queryClient = useQueryClient();
	useEffect(() => {
		const refresh = () => {
			void queryClient.invalidateQueries();
		};
		window.addEventListener("realtime-connected", refresh);
		return () => window.removeEventListener("realtime-connected", refresh);
	}, [queryClient]);

	const [storyDialogOpen, setStoryDialogOpen] = useState(false);
	const [storyTitle, setStoryTitle] = useState("");
	const [storyDescription, setStoryDescription] = useState("");
	const [selectedVote, setSelectedVote] = useState<string | null>(null);
	const [shareDialogOpen, setShareDialogOpen] = useState(false);
	const [copied, setCopied] = useState(false);
	const [isAbstaining, setIsAbstaining] = useState(false);
	const [displayTime, setDisplayTime] = useState("0:00");
	const [isFinalizingVoting, setIsFinalizingVoting] = useState(false);
	const [showConsensusResult, setShowConsensusResult] = useState<{
		score: string;
		storyTitle: string;
	} | null>(null);
	// the consensus modal closes itself after 5 seconds; a newer result restarts the clock
	useEffect(() => {
		if (!showConsensusResult) return;
		const timer = setTimeout(() => setShowConsensusResult(null), 5000);
		return () => clearTimeout(timer);
	}, [showConsensusResult]);

	const elemId = useId();

	// Get anonymous user if not logged in
	const { data: anonymousData } = useQuery({
		queryKey: ["anonymous-user"],
		queryFn: async () => {
			const response = await fetch("/api/anonymous/current");
			if (!response.ok) throw new Error("Failed to fetch anonymous user");
			return response.json();
		},
		enabled: !user,
	});

	// Get current user from database
	const { data: currentUser } = useQuery({
		queryKey: ["currentUser", user?.id],
		queryFn: async () => {
			if (!user) return null;
			const response = await fetch("/api/users/current");
			if (!response.ok) throw new Error("Failed to fetch current user");
			const { user: data } = await response.json();
			return data as User;
		},
		enabled: !!user,
	});

	// Fetch session data
	const {
		data: sessionData,
		isLoading,
		error: sessionError,
	} = useQuery({
		queryKey: ["poker-session", sessionId, user?.id, anonymousData?.user?.id],
		refetchInterval: false,
		staleTime: 1000,
		queryFn: async () => {
			if (!user && !anonymousData?.user) throw new Error("Not authenticated");

			const response = await fetch(`/api/poker-sessions/${sessionId}`);

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || "Failed to fetch session");
			}

			return response.json();
		},
		enabled: (!!user && isLoaded) || !!anonymousData?.user,
	});

	const session = sessionData?.session as SessionData | undefined;

	// Memoize the message handler to prevent reconnections
	const handlePokerMessage = useCallback(
		(message: { type: string; storyId?: string }) => {
			// Invalidate queries on relevant events
			if (
				message.type === "story_create" ||
				message.type === "story_select" ||
				message.type === "vote" ||
				message.type === "voting_start" ||
				message.type === "voting_end" ||
				message.type === "score_calculated"
			) {
				queryClient.invalidateQueries({
					queryKey: ["poker-session", sessionId],
				});
			}
		},
		[queryClient, sessionId],
	);

	// Use poker channel for real-time updates
	const {
		isConnected,
		selectStory,
		sessionState,
		announceScore,
		endVoting,
		abstain,
		unabstain,
		startTimer,
		stopTimer,
		startVoting,
	} = usePokerChannel({
		enabled: !!session,
		sessionId,
		isAnonymous: !user,
		anonymousUserId: anonymousData?.user?.id,
		onMessage: handlePokerMessage,
	});

	// Log connection status - only log on actual changes
	useEffect(() => {
		if (isConnected !== undefined) {
			// Connection status handled silently
		}
	}, [isConnected]);

	// Get current story
	const currentStory = session?.stories.find(
		(s) => s.id === session.current_story_id,
	);

	// The stories list can be narrowed to TrackLin.es labels (e.g. "frontend"); it's only a
	// view: every backlog ticket stays in the session, in case one is labelled wrong
	const [storyLabels, setStoryLabels] = useState<string[]>([]);
	const labelCounts = new Map<string, number>();
	for (const story of session?.stories ?? [])
		for (const label of story.tracklines_labels ?? [])
			labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
	const labelOptions = [...labelCounts].sort((a, b) => b[1] - a[1]);
	const storyList = usePaged(
		(session?.stories ?? []).filter(
			(story) =>
				!storyLabels.length ||
				storyLabels.some((label) =>
					hasLabel({ labels: story.tracklines_labels }, label),
				),
		),
	);

	// Check if user is facilitator
	const isFacilitator = session?.participants.some(
		(p) => p.user.id === currentUser?.id && p.role === "facilitator",
	);

	// Timer hook for voting sessions
	const timer = usePokerTimer({
		onExpire: async () => {
			if (isFacilitator && currentStory) {
				// Calculate and announce score when timer expires
				await handleFinalizeVoting();
			}
		},
	});

	// scoreStory ends voting, reveals the votes, and works out the current story's result. A
	// most-common tie stops before the result is saved: the facilitator then picks one of the
	// tied values (pick), which scores it.
	const scoreStory = useCallback(
		async (pick?: string) => {
			if (!currentStory) return;
			const response = await fetch(`/api/poker-sessions/${sessionId}/score`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ storyId: currentStory.id, pick }),
			});
			const data = await response.json().catch(() => ({}));
			if (!response.ok)
				throw new Error(data.error || "Failed to calculate score");

			await endVoting(currentStory.id);
			await fetch(`/api/poker-sessions/${sessionId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ reveal_votes: true }),
			});

			if (!data.tie) {
				await announceScore(currentStory.id, data.finalScore, data.votes);
				setShowConsensusResult({
					score: data.finalScore,
					storyTitle: currentStory.title,
				});
			}
			await queryClient.invalidateQueries({
				queryKey: ["poker-session", sessionId],
			});
		},
		[currentStory, sessionId, endVoting, announceScore, queryClient],
	);

	// Function to finalize voting and calculate score
	const handleFinalizeVoting = useCallback(async () => {
		if (!currentStory || isFinalizingVoting) return;

		setIsFinalizingVoting(true);

		try {
			// Stop timer if running
			if (timer.isActive) {
				timer.stop();
				await stopTimer();
			}

			// Calculate score only if there are votes
			const hasVotes = currentStory.votes && currentStory.votes.length > 0;

			if (hasVotes) {
				await scoreStory();
			} else {
				// No votes received
				await endVoting(currentStory.id);
				toast.warning("Timer expired with no votes received");
			}

			// Invalidate queries to show the updated results immediately
			await queryClient.invalidateQueries({
				queryKey: ["poker-session", sessionId],
			});
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to finalize voting",
			);
		} finally {
			setIsFinalizingVoting(false);
		}
	}, [
		currentStory,
		timer,
		stopTimer,
		sessionId,
		endVoting,
		scoreStory,
		queryClient,
		isFinalizingVoting,
	]);

	// Handle automatic voting completion with grace period
	// biome-ignore lint/correctness/useExhaustiveDependencies: votesReceived needed to detect vote changes
	useEffect(() => {
		let graceTimeoutId: NodeJS.Timeout | null = null;

		if (
			!sessionState.votingState.allVoted ||
			!isFacilitator ||
			!currentStory ||
			isFinalizingVoting ||
			!sessionState.timer?.isActive // Don't auto-finalize if timer is not active
		) {
			// Clear any existing grace period timeout
			if (graceTimeoutId) {
				clearTimeout(graceTimeoutId);
			}
			return;
		}

		// Start/restart grace period
		toast.info(
			"All votes received. 10 seconds to change votes before consensus.",
		);

		graceTimeoutId = setTimeout(async () => {
			await handleFinalizeVoting();
		}, 10000); // 10 seconds

		// Cleanup on unmount or when dependencies change
		return () => {
			if (graceTimeoutId) {
				clearTimeout(graceTimeoutId);
			}
		};
	}, [
		sessionState.votingState.allVoted,
		sessionState.votingState.votesReceived, // Reset grace period when votes change
		isFacilitator,
		currentStory,
		isFinalizingVoting,
		sessionState.timer?.isActive,
		handleFinalizeVoting,
	]);

	// Get user's vote for current story
	const userVote = currentStory?.votes.find((v) => {
		if (currentUser) {
			return v.user_id === currentUser.id;
		}
		if (anonymousData?.user) {
			return v.anonymous_user_id === anonymousData.user.id;
		}
		return false;
	});

	// Check if current user is abstaining from session state
	useEffect(() => {
		const userId = currentUser?.id || anonymousData?.user?.id;
		if (userId) {
			const participant = sessionState.participants.find(
				(p) => p.id === userId,
			);
			if (participant) {
				setIsAbstaining(participant.isAbstaining);
			}
		}
	}, [sessionState.participants, currentUser?.id, anonymousData?.user?.id]);

	// Sync timer state from session state
	useEffect(() => {
		if (sessionState.timer.isActive && sessionState.timer.endsAt) {
			timer.startUntil(sessionState.timer.endsAt);
		} else if (!sessionState.timer.isActive && timer.isActive) {
			timer.stop();
		}
	}, [sessionState.timer, timer.isActive, timer.startUntil, timer.stop]);

	// Update display timer every second
	useEffect(() => {
		if (!sessionState.timer.isActive || !sessionState.timer.endsAt) {
			setDisplayTime("0:00");
			return;
		}

		const updateDisplayTime = () => {
			if (!sessionState.timer.endsAt) return;
			const remaining = Math.max(
				0,
				Math.floor(
					(new Date(sessionState.timer.endsAt).getTime() - Date.now()) / 1000,
				),
			);
			const mins = Math.floor(remaining / 60);
			const secs = remaining % 60;
			setDisplayTime(`${mins}:${secs.toString().padStart(2, "0")}`);
		};

		// Update immediately
		updateDisplayTime();

		// Then update every second
		const interval = setInterval(updateDisplayTime, 1000);

		return () => clearInterval(interval);
	}, [sessionState.timer.isActive, sessionState.timer.endsAt]);

	// Create story mutation
	const createStoryMutation = useMutation({
		mutationFn: async ({
			title,
			description,
		}: {
			title: string;
			description?: string;
		}) => {
			const response = await fetch(`/api/poker-sessions/${sessionId}/stories`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ title, description }),
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || "Failed to create story");
			}

			return response.json();
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["poker-session", sessionId] });
			setStoryDialogOpen(false);
			setStoryTitle("");
			setStoryDescription("");
		},
	});

	// Vote mutation
	const voteMutation = useMutation({
		mutationFn: async ({
			storyId,
			vote,
		}: {
			storyId: string;
			vote: string;
		}) => {
			const response = await fetch(`/api/poker-sessions/${sessionId}/votes`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ storyId, vote }),
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || "Failed to vote");
			}

			return response.json();
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["poker-session", sessionId] });
		},
		onError: (error) => {
			console.error("Vote error:", error);
			toast.error(error.message || "Failed to vote");
		},
	});

	// Set current story mutation
	const setCurrentStoryMutation = useMutation({
		mutationFn: async ({
			storyId,
			storyTitle,
		}: {
			storyId: string;
			storyTitle: string;
		}) => {
			const response = await fetch(`/api/poker-sessions/${sessionId}`, {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					current_story_id: storyId,
					reveal_votes: false,
				}),
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || "Failed to set current story");
			}

			// Broadcast the story selection through the channel
			if (selectStory) {
				await selectStory(storyId, storyTitle);
			}

			// Start voting and timer (60 seconds default)
			if (startVoting) {
				await startVoting(storyId);
			}
			if (startTimer) {
				const timerDuration = 60; // 60 seconds default
				await startTimer(timerDuration);
			}

			return response.json();
		},
		onSuccess: () => {
			setSelectedVote(null);
			setIsFinalizingVoting(false); // Reset when new story is selected
			setShowConsensusResult(null); // Clear any previous consensus display
		},
		onError: (error) => toast.error(error.message || "Failed to switch story"),
		// The story is saved before the live updates go out: refresh even if one of those fails
		onSettled: () =>
			queryClient.invalidateQueries({ queryKey: ["poker-session", sessionId] }),
	});

	// The facilitator changes how results are worked out; stories already estimated keep theirs
	const resultMethodMutation = useMutation({
		mutationFn: async (result_method: ResultMethod) => {
			const response = await fetch(`/api/poker-sessions/${sessionId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ result_method }),
			});
			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || "Failed to change result method");
			}
		},
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: ["poker-session", sessionId] }),
		onError: (error) => toast.error(error.message),
	});

	// A most-common tie, waiting for the facilitator to pick (derived, so it survives a refresh)
	const tiedValues =
		session?.result_method === "mode" &&
		session.reveal_votes &&
		currentStory &&
		!currentStory.final_estimate
			? mostCommon(
					currentStory.votes.map((v) => v.vote_value),
					session.estimation_type,
					session.estimation_values ?? undefined,
				)
			: [];

	// Toggle reveal votes mutation
	const toggleRevealMutation = useMutation({
		mutationFn: async () => {
			const isRevealing = !session?.reveal_votes;

			// If revealing votes and there are votes, also calculate consensus (if not already estimated)
			if (
				isRevealing &&
				currentStory?.votes &&
				currentStory.votes.length > 0 &&
				!currentStory.final_estimate
			) {
				// First reveal the votes
				const revealResponse = await fetch(`/api/poker-sessions/${sessionId}`, {
					method: "PATCH",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						reveal_votes: true,
					}),
				});

				if (!revealResponse.ok) {
					const error = await revealResponse.json();
					throw new Error(error.error || "Failed to reveal votes");
				}

				// Stop the timer if it's running, then work out the result
				if (sessionState.timer?.isActive) {
					await stopTimer();
				}
				await scoreStory();

				return revealResponse.json();
			}

			// If hiding votes (resetting for another round of voting)
			if (!isRevealing && currentStory) {
				// Hide the votes
				const response = await fetch(`/api/poker-sessions/${sessionId}`, {
					method: "PATCH",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						reveal_votes: false,
					}),
				});

				if (!response.ok) {
					const error = await response.json();
					throw new Error(error.error || "Failed to hide votes");
				}

				// Delete all votes for the current story to reset
				await fetch(`/api/poker-sessions/${sessionId}/votes`, {
					method: "DELETE",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						storyId: currentStory.id,
					}),
				});

				// Restart voting and timer
				if (startVoting) {
					await startVoting(currentStory.id);
				}
				if (startTimer) {
					await startTimer(60); // Restart with 60 seconds
				}

				// Clear the selected vote
				setSelectedVote(null);

				// Clear consensus display if showing
				setShowConsensusResult(null);

				toast.info("Votes reset. Starting new voting round.");

				return response.json();
			}

			// Default case - just toggle reveal state
			const response = await fetch(`/api/poker-sessions/${sessionId}`, {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					reveal_votes: isRevealing,
				}),
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || "Failed to toggle reveal");
			}

			return response.json();
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["poker-session", sessionId] });
		},
	});

	// Complete session mutation
	const completeSessionMutation = useMutation({
		mutationFn: async () => {
			const response = await fetch(`/api/poker-sessions/${sessionId}`, {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					status: "completed",
					completed_at: new Date().toISOString(),
				}),
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || "Failed to complete session");
			}

			return response.json();
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["poker-session", sessionId] });
			toast.success("Poker session completed!");
		},
	});

	// Finalize story mutation
	const finalizeStoryMutation = useMutation({
		mutationFn: async ({
			storyId,
			estimate,
		}: {
			storyId: string;
			estimate: string;
		}) => {
			const response = await fetch(`/api/poker-sessions/${sessionId}/stories`, {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					storyId,
					final_estimate: estimate,
				}),
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || "Failed to finalize story");
			}

			return response.json();
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["poker-session", sessionId] });
		},
	});

	const handleVote = (vote: string) => {
		if (currentStory && (currentUser || anonymousData?.user)) {
			setSelectedVote(vote);
			setIsAbstaining(false); // Clear abstaining when voting
			voteMutation.mutate({ storyId: currentStory.id, vote });
		}
	};

	const handleAbstain = async () => {
		if (isAbstaining) {
			await unabstain();
			setIsAbstaining(false);
		} else {
			await abstain();
			setIsAbstaining(true);
			setSelectedVote(null); // Clear any selected vote
		}
	};

	const estimationValues = session?.estimation_values
		? [...session.estimation_values, "?"]
		: ESTIMATION_VALUES[session?.estimation_type || "fibonacci"];

	// Generate share URL
	const shareUrl = session?.share_id
		? `${typeof window !== "undefined" ? window.location.origin : ""}/poker/join/${session.share_id}`
		: "";

	const copyShareUrl = () => {
		if (shareUrl) {
			navigator.clipboard.writeText(shareUrl);
			setCopied(true);
			toast("Link copied!");
			setTimeout(() => setCopied(false), 2000);
		}
	};

	if (!isLoaded || isLoading || (user && !syncedUser)) {
		return (
			<div className="container mx-auto py-8">
				<div className="flex h-64 items-center justify-center">
					<p className="text-muted-foreground">Loading session...</p>
				</div>
			</div>
		);
	}

	if (!user && !anonymousData?.user) {
		return (
			<div className="container mx-auto py-8">
				<div className="flex h-64 items-center justify-center">
					<p className="text-muted-foreground">
						Please sign in or join via share link to view this session
					</p>
				</div>
			</div>
		);
	}

	if (sessionError) {
		return (
			<div className="container mx-auto py-8">
				<div className="flex h-64 items-center justify-center">
					<p className="text-red-500">Error: {sessionError.message}</p>
				</div>
			</div>
		);
	}

	if (!session) {
		return (
			<div className="container mx-auto py-8">
				<div className="flex h-64 items-center justify-center">
					<p className="text-muted-foreground">Session not found</p>
				</div>
			</div>
		);
	}

	return (
		<div className="container mx-auto py-8">
			{session.status === "completed" && (
				<div className="mb-6 rounded-lg border border-green-500 bg-green-50 p-4 dark:bg-green-950">
					<div className="flex items-center gap-2">
						<Trophy className="h-5 w-5 text-green-600 dark:text-green-400" />
						<span className="font-semibold text-green-600 dark:text-green-400">
							Session Completed
						</span>
					</div>
					<p className="mt-1 text-muted-foreground text-sm">
						This poker session has been completed. All stories have been
						estimated.
					</p>
				</div>
			)}
			<div className="mb-8 flex items-center justify-between">
				<div>
					<h1 className="font-bold text-3xl">{session.name}</h1>
					{session.description && (
						<p className="mt-1 text-muted-foreground">{session.description}</p>
					)}
				</div>
				<div className="flex gap-2">
					<Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
						<DialogTrigger asChild>
							<Button variant="outline">
								<Share2 className="mr-2 h-4 w-4" />
								Share
							</Button>
						</DialogTrigger>
						<DialogContent>
							<DialogHeader>
								<DialogTitle>Share Poker Session</DialogTitle>
								<DialogDescription>
									Share this link with others to let them join this session
								</DialogDescription>
							</DialogHeader>
							<div className="mt-4 flex gap-2">
								<Input value={shareUrl} readOnly className="flex-1" />
								<Button variant="outline" size="icon" onClick={copyShareUrl}>
									{copied ? (
										<Check className="h-4 w-4" />
									) : (
										<Copy className="h-4 w-4" />
									)}
								</Button>
							</div>
						</DialogContent>
					</Dialog>
					{isFacilitator && session?.status !== "completed" && (
						<select
							aria-label="How the result is worked out"
							title="How the result is worked out"
							className="h-9 rounded-md border bg-background px-2 text-sm"
							value={session?.result_method ?? "average"}
							disabled={resultMethodMutation.isPending}
							onChange={(e) =>
								resultMethodMutation.mutate(e.target.value as ResultMethod)
							}
						>
							{RESULT_METHODS.map((method) => (
								<option key={method} value={method}>
									{RESULT_METHOD_LABELS[method]}
								</option>
							))}
						</select>
					)}
					{isFacilitator && session?.status !== "completed" && (
						<Button
							variant="destructive"
							onClick={() => {
								if (
									confirm(
										"Are you sure you want to complete this poker session? This action cannot be undone.",
									)
								) {
									completeSessionMutation.mutate();
								}
							}}
						>
							<Trophy className="mr-2 h-4 w-4" />
							Complete Session
						</Button>
					)}
					{isFacilitator && session?.status !== "completed" && (
						<Dialog open={storyDialogOpen} onOpenChange={setStoryDialogOpen}>
							<DialogTrigger asChild>
								<Button>
									<Plus className="mr-2 h-4 w-4" />
									Add Story
								</Button>
							</DialogTrigger>
							<DialogContent>
								<DialogHeader>
									<DialogTitle>Add Story</DialogTitle>
									<DialogDescription>
										Add a new story for estimation.
									</DialogDescription>
								</DialogHeader>
								<div className="grid gap-4 py-4">
									<div className="grid gap-2">
										<Label htmlFor="title">Story Title</Label>
										<Input
											id={`${elemId}-title`}
											value={storyTitle}
											onChange={(e) => setStoryTitle(e.target.value)}
											placeholder="As a user, I want to..."
										/>
									</div>
									<div className="grid gap-2">
										<Label htmlFor="description">Description (optional)</Label>
										<Textarea
											id={`${elemId}-description`}
											value={storyDescription}
											onChange={(e) => setStoryDescription(e.target.value)}
											placeholder="Additional details about the story"
											rows={3}
										/>
									</div>
								</div>
								<DialogFooter>
									<Button
										variant="outline"
										onClick={() => setStoryDialogOpen(false)}
									>
										Cancel
									</Button>
									<Button
										onClick={() =>
											createStoryMutation.mutate({
												title: storyTitle,
												description: storyDescription,
											})
										}
										disabled={
											!storyTitle.trim() || createStoryMutation.isPending
										}
									>
										{createStoryMutation.isPending ? "Adding..." : "Add Story"}
									</Button>
								</DialogFooter>
							</DialogContent>
						</Dialog>
					)}
				</div>
			</div>

			{/* Consensus result: a modal that closes itself after 5 seconds */}
			<Dialog
				open={!!showConsensusResult}
				onOpenChange={(open) => !open && setShowConsensusResult(null)}
			>
				<DialogContent className="border-green-500 sm:max-w-md">
					<DialogHeader className="items-center text-center sm:text-center">
						<CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
						<DialogTitle className="text-2xl text-green-900 dark:text-green-100">
							Consensus Reached!
						</DialogTitle>
						<DialogDescription className="text-center text-base">
							{showConsensusResult?.storyTitle}
						</DialogDescription>
					</DialogHeader>
					<div className="flex justify-center py-2">
						<span className="rounded-xl bg-green-50 px-8 py-4 font-bold text-5xl text-green-700 shadow-lg dark:bg-green-950 dark:text-green-300">
							{showConsensusResult?.score}
						</span>
					</div>
				</DialogContent>
			</Dialog>

			<div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
				<div className="space-y-6 lg:col-span-2">
					{/* Current Story */}
					{currentStory ? (
						<Card>
							<CardHeader>
								<div className="flex items-center justify-between">
									<div>
										<CardTitle>Current Story</CardTitle>
										<CardDescription>{currentStory.title}</CardDescription>
										<TracklinesStory story={currentStory} />
										{!currentStory.tracklines_key &&
											currentStory.description && (
												<Markdown className="mt-2 text-sm">
													{currentStory.description}
												</Markdown>
											)}
									</div>
									{sessionState.timer.isActive && (
										<div
											className="flex items-center gap-2 text-muted-foreground"
											data-testid="timer-display"
										>
											<Timer className="h-5 w-5" />
											<span className="font-bold font-mono text-lg">
												{displayTime}
											</span>
										</div>
									)}
								</div>
							</CardHeader>
							<CardContent>
								<div className="mb-6 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
									{estimationValues.map((value) => (
										<VoteCard
											key={value}
											value={value}
											selected={
												selectedVote === value || userVote?.vote_value === value
											}
											onClick={() => handleVote(value)}
											disabled={session.reveal_votes || isAbstaining}
										/>
									))}
								</div>

								{/* Abstain button for non-facilitators */}
								{!isFacilitator && (
									<div className="mb-4 flex justify-center">
										<Button
											onClick={handleAbstain}
											variant={isAbstaining ? "default" : "outline"}
											disabled={session.reveal_votes}
										>
											{isAbstaining
												? "Cancel Abstention"
												: "Abstain from Voting"}
										</Button>
									</div>
								)}

								{isFacilitator && (
									<div className="flex gap-2">
										<Button
											onClick={() => toggleRevealMutation.mutate()}
											variant={session.reveal_votes ? "secondary" : "default"}
										>
											{session.reveal_votes ? (
												<>
													<EyeOff className="mr-2 h-4 w-4" />
													Hide Votes
												</>
											) : (
												<>
													<Eye className="mr-2 h-4 w-4" />
													Reveal Votes
												</>
											)}
										</Button>
										{session.reveal_votes && (
											<Button
												variant="outline"
												onClick={() => {
													const consensus = prompt("Enter the final estimate:");
													if (consensus) {
														finalizeStoryMutation.mutate({
															storyId: currentStory.id,
															estimate: consensus,
														});
													}
												}}
											>
												Finalize Estimate
											</Button>
										)}
									</div>
								)}

								{tiedValues.length > 1 && (
									<div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
										<p className="mb-2 font-semibold">
											Tie between {tiedValues.join(", ")}
										</p>
										{isFacilitator ? (
											<div className="flex flex-wrap gap-2">
												{tiedValues.map((value) => (
													<Button
														key={value}
														variant="outline"
														onClick={() =>
															scoreStory(value).catch((error: Error) =>
																toast.error(error.message),
															)
														}
													>
														Pick {value}
													</Button>
												))}
											</div>
										) : (
											<p className="text-muted-foreground text-sm">
												Waiting for the facilitator to pick one.
											</p>
										)}
									</div>
								)}

								{session.reveal_votes && currentStory.votes.length > 0 && (
									<div className="mt-6">
										{currentStory.final_estimate && (
											<div className="mb-4 rounded-lg bg-green-50 p-4 dark:bg-green-950">
												<div className="flex items-center justify-between">
													<div className="flex items-center gap-2">
														<CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
														<span className="font-semibold">
															Final Estimate
														</span>
													</div>
													<Badge variant="default" className="text-lg">
														{currentStory.final_estimate}
													</Badge>
												</div>
												{currentStory.result_method && (
													<p className="mt-2 text-muted-foreground text-sm">
														{currentStory.tied_values?.length
															? `Tie between ${currentStory.tied_values.join(", ")}; the facilitator picked ${currentStory.final_estimate}`
															: currentStory.result_method === "mode"
																? "Most common vote"
																: "Average of the votes, snapped to the nearest card"}
													</p>
												)}
											</div>
										)}
										<h4 className="mb-3 font-semibold">Votes:</h4>
										<div className="space-y-2">
											{currentStory.votes.map((vote) => (
												<div
													key={vote.id}
													className="flex items-center justify-between"
												>
													<span className="text-sm">
														{vote.user
															? vote.user.name || vote.user.email
															: vote.anonymous_user?.display_name}
													</span>
													<Badge>{vote.vote_value}</Badge>
												</div>
											))}
										</div>
									</div>
								)}
							</CardContent>
						</Card>
					) : (
						<Card>
							<CardContent className="flex h-64 items-center justify-center">
								<p className="text-muted-foreground">
									{session.stories.length === 0
										? "No stories added yet"
										: "Select a story to start voting"}
								</p>
							</CardContent>
						</Card>
					)}

					{/* Story List */}
					<Card>
						<CardHeader>
							<div className="flex flex-wrap items-center justify-between gap-2">
								<CardTitle>Stories</CardTitle>
								{labelOptions.length > 0 && (
									<LabelFilter
										labels={labelOptions}
										selected={storyLabels}
										onChange={setStoryLabels}
									/>
								)}
							</div>
						</CardHeader>
						<CardContent>
							<div className="space-y-2">
								{storyList.items.map((story) => (
									// biome-ignore lint/a11y/useKeyWithClickEvents: hmm
									// biome-ignore lint/a11y/noStaticElementInteractions: hmm
									<div
										key={story.id}
										className={`cursor-pointer rounded-lg border p-3 transition-colors ${
											story.id === currentStory?.id
												? "border-primary bg-primary/10"
												: "hover:bg-muted"
										}`}
										onClick={() => {
											if (isFacilitator && story.id !== currentStory?.id) {
												setCurrentStoryMutation.mutate({
													storyId: story.id,
													storyTitle: story.title,
												});
											}
										}}
									>
										<div className="flex items-center justify-between">
											<div className="wrap-anywhere min-w-0 flex-1">
												{story.tracklines_key && (
													<p className="font-mono text-muted-foreground text-xs">
														{story.tracklines_key}
													</p>
												)}
												<p className="font-medium">{story.title}</p>
												{story.description && (
													// a preview: the full description shows when it's the current story
													<Markdown className="mt-1 line-clamp-3 text-muted-foreground text-sm [&_*]:my-0">
														{story.description}
													</Markdown>
												)}
											</div>
											<div className="flex items-center gap-2">
												{story.is_estimated && (
													<Badge variant="secondary">
														<Check className="mr-1 h-3 w-3" />
														{story.final_estimate}
													</Badge>
												)}
												{story.id === currentStory?.id && (
													<ChevronRight className="h-4 w-4 text-primary" />
												)}
											</div>
										</div>
									</div>
								))}
								{storyList.pager}
								{session.stories.length === 0 && (
									<p className="py-8 text-center text-muted-foreground">
										No stories added yet
									</p>
								)}
							</div>
						</CardContent>
					</Card>
				</div>

				{/* TrackLin.es planning (a side drawer) and participants */}
				<div>
					<TracklinesPlanning
						sessionId={sessionId}
						facilitator={!!isFacilitator}
						linked={!!session.tracklines_board_id}
						currentStoryId={currentStory?.id}
						onSelect={(story) => {
							if (story.id !== currentStory?.id)
								setCurrentStoryMutation.mutate({
									storyId: story.id,
									storyTitle: story.title,
								});
						}}
						revision={session.stories
							.map((story) => `${story.id}:${story.final_estimate ?? ""}`)
							.join(",")}
					/>
					<ParticipantList
						participants={session.participants}
						anonymousParticipants={session.anonymous_participants}
						currentStory={currentStory}
						showVotes={session.reveal_votes}
						sessionState={sessionState}
					/>
				</div>
			</div>
		</div>
	);
}
