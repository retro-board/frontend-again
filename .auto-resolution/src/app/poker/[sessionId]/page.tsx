"use client";

import { useUser } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	Check,
	ChevronRight,
	Copy,
	Eye,
	EyeOff,
	Plus,
	Share2,
} from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useId, useState } from "react";
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

	// Subscribe to realtime updates
	useEffect(() => {
		console.log("Setting up real-time subscription for session:", sessionId);
		const channel = supabase
			.channel(`poker:${sessionId}`)
			.on(
				"postgres_changes",
				{
					event: "*",
					schema: "public",
					table: "poker_sessions",
					filter: `id=eq.${sessionId}`,
				},
				(payload) => {
					console.log("Poker session changed:", payload);
					queryClient.invalidateQueries({
						queryKey: ["poker-session", sessionId],
					});
				},
			)
			.on(
				"postgres_changes",
				{
					event: "*",
					schema: "public",
					table: "stories",
					filter: `session_id=eq.${sessionId}`,
				},
				(payload) => {
					console.log("Story changed:", payload);
					queryClient.invalidateQueries({
						queryKey: ["poker-session", sessionId],
					});
				},
			)
			.on(
				"postgres_changes",
				{
					event: "*",
					schema: "public",
					table: "poker_votes",
					// Note: Can't filter poker_votes by session_id directly, but the query will refetch all data
				},
				(payload) => {
					console.log("Vote changed:", payload);
					queryClient.invalidateQueries({
						queryKey: ["poker-session", sessionId],
					});
				},
			)
			.subscribe((status) => {
				console.log("Subscription status:", status);
			});

		return () => {
			supabase.removeChannel(channel);
		};
	}, [sessionId, queryClient]);

	// Get current story
	const currentStory = session?.stories.find(
		(s) => s.id === session.current_story_id,
	);

	// Check if user is facilitator
	const isFacilitator = session?.participants.some(
		(p) => p.user.id === currentUser?.id && p.role === "facilitator",
	);

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
		mutationFn: async (storyId: string) => {
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

			return response.json();
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["poker-session", sessionId] });
			setSelectedVote(null);
		},
	});

	// Toggle reveal votes mutation
	const toggleRevealMutation = useMutation({
		mutationFn: async () => {
			const response = await fetch(`/api/poker-sessions/${sessionId}`, {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					reveal_votes: !session?.reveal_votes,
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
			voteMutation.mutate({ storyId: currentStory.id, vote });
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
					{isFacilitator && (
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
								<CardTitle>Current Story</CardTitle>
								<CardDescription>{currentStory.title}</CardDescription>
								{currentStory.description && (
									<p className="mt-2 text-sm">{currentStory.description}</p>
								)}
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
											disabled={session.reveal_votes}
										/>
									))}
								</div>

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
												setCurrentStoryMutation.mutate(story.id);
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
					/>
				</div>
			</div>
		</div>
	);
}
