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
import { ParticipantList } from "~/components/poker/ParticipantList";
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
import { supabase } from "~/lib/supabase/client";
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

	const [storyDialogOpen, setStoryDialogOpen] = useState(false);
	const [storyTitle, setStoryTitle] = useState("");
	const [storyDescription, setStoryDescription] = useState("");
	const [selectedVote, setSelectedVote] = useState<string | null>(null);
	const [shareDialogOpen, setShareDialogOpen] = useState(false);
	const [copied, setCopied] = useState(false);
	const [isAbstaining, setIsAbstaining] = useState(false);
	const [displayTime, setDisplayTime] = useState("0:00");
	const [isFinalizingVoting, setIsFinalizingVoting] = useState(false);

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
			const { data } = await supabase
				.from("users")
				.select("*")
				.eq("clerk_id", user.id)
				.single();
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
			console.log("Poker channel message:", message);

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
		sessionId,
		isAnonymous: !user,
		anonymousUserId: anonymousData?.user?.id,
		onMessage: handlePokerMessage,
	});

	// Log connection status - only log on actual changes
	useEffect(() => {
		if (isConnected !== undefined) {
			console.log("Poker channel connection changed:", isConnected);
		}
	}, [isConnected]);

	// Get current story
	const currentStory = session?.stories.find(
		(s) => s.id === session.current_story_id,
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
				const response = await fetch(`/api/poker-sessions/${sessionId}/score`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ storyId: currentStory.id }),
				});

				if (response.ok) {
					const { finalScore, votes } = await response.json();

					// Update the story with final estimate
					await fetch(`/api/poker-sessions/${sessionId}/stories`, {
						method: "PATCH",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							storyId: currentStory.id,
							final_estimate: finalScore,
						}),
					});

					// End voting and announce score
					await endVoting(currentStory.id);
					await announceScore(currentStory.id, finalScore, votes);

					// Keep votes revealed to show finalized results immediately
					await fetch(`/api/poker-sessions/${sessionId}`, {
						method: "PATCH",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ reveal_votes: true }),
					});

					toast.success(`Story estimated: ${finalScore}`);
				}
			} else {
				// No votes received
				await endVoting(currentStory.id);
				toast.warning("Timer expired with no votes received");
			}

			// Invalidate queries to show the updated results immediately
			await queryClient.invalidateQueries({
				queryKey: ["poker-session", sessionId],
			});
		} finally {
			setIsFinalizingVoting(false);
		}
	}, [
		currentStory,
		timer,
		stopTimer,
		sessionId,
		endVoting,
		announceScore,
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
		console.log(
			"All votes received. Starting 10-second grace period for vote changes...",
		);

		graceTimeoutId = setTimeout(async () => {
			console.log("Grace period ended. Calculating consensus...");
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
			queryClient.invalidateQueries({ queryKey: ["poker-session", sessionId] });
			setSelectedVote(null);
			setIsFinalizingVoting(false); // Reset when new story is selected
		},
	});

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

				// Then calculate and save the consensus score
				const scoreResponse = await fetch(
					`/api/poker-sessions/${sessionId}/score`,
					{
						method: "POST",
						headers: {
							"Content-Type": "application/json",
						},
						body: JSON.stringify({
							storyId: currentStory.id,
						}),
					},
				);

				if (!scoreResponse.ok) {
					const error = await scoreResponse.json();
					throw new Error(error.error || "Failed to calculate score");
				}

				const { finalScore, votes } = await scoreResponse.json();

				// Stop the timer if it's running
				if (sessionState.timer?.isActive) {
					await stopTimer();
				}

				// End voting and announce score through the channel
				await endVoting(currentStory.id);
				await announceScore(currentStory.id, finalScore, votes);

				toast.success(`Story estimated: ${finalScore}`);

				return revealResponse.json();
			}
			// Just toggle reveal state (hiding votes or revealing when no votes)
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

	const estimationValues =
		ESTIMATION_VALUES[session?.estimation_type || "fibonacci"];

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
										{currentStory.description && (
											<p className="mt-2 text-sm">{currentStory.description}</p>
										)}
									</div>
									{sessionState.timer.isActive && (
										<div className="flex items-center gap-2 text-muted-foreground">
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
							<CardTitle>Stories</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="space-y-2">
								{session.stories.map((story) => (
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
											<div className="flex-1">
												<p className="font-medium">{story.title}</p>
												{story.description && (
													<p className="mt-1 text-muted-foreground text-sm">
														{story.description}
													</p>
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
								{session.stories.length === 0 && (
									<p className="py-8 text-center text-muted-foreground">
										No stories added yet
									</p>
								)}
							</div>
						</CardContent>
					</Card>
				</div>

				{/* Participants */}
				<div>
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
