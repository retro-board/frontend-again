"use client";

import { useUser } from "@clerk/nextjs";
import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	DragOverlay,
} from "@dnd-kit/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Plus, Share2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { BoardColumn } from "~/components/boards/BoardColumn";
import { BoardSettings } from "~/components/boards/BoardSettings";
import { BoardTimer } from "~/components/boards/BoardTimer";
import { Card as CardComponent } from "~/components/boards/Card";
import { Button } from "~/components/ui/button";
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
import { useUserSync } from "~/hooks/useUserSync";
import { BoardChannel } from "~/lib/supabase/channels-client";
import { supabase } from "~/lib/supabase/client";
import type {
	Board,
	Card,
	CardVote,
	ColumnWithCards,
	User,
} from "~/types/database";

export default function BoardPage() {
	const params = useParams();
	const boardId = params.boardId as string;
	const { user, isLoaded } = useUser();
	const { syncedUser } = useUserSync();
	const queryClient = useQueryClient();

	const [columnDialogOpen, setColumnDialogOpen] = useState(false);
	const [columnName, setColumnName] = useState("");
	const [columnColor, setColumnColor] = useState("#gray");
	const [activeCard, setActiveCard] = useState<Card | null>(null);
	const [shareDialogOpen, setShareDialogOpen] = useState(false);
	const [copied, setCopied] = useState(false);

	const elemId = useId();

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

	// Fetch board data and columns
	const {
		data: boardData,
		isLoading: boardLoading,
		error: boardError,
	} = useQuery({
		queryKey: ["board", boardId, user?.id, anonymousData?.user?.id],
		queryFn: async () => {
			if (!user && !anonymousData?.user) throw new Error("Not authenticated");

			const response = await fetch(`/api/boards/${boardId}`);

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || "Failed to fetch board");
			}

			return response.json();
		},
		enabled: (!!user && isLoaded) || !!anonymousData?.user,
		staleTime: 5000, // Consider data fresh for 5 seconds
		refetchInterval: false, // Disable automatic refetching
	});

	const board = boardData?.board as Board | undefined;
	const columns = boardData?.columns || [];
	const isOwner = board?.owner_id === currentUser?.id;

	// Generate share URL
	const shareUrl = board?.share_id
		? `${typeof window !== "undefined" ? window.location.origin : ""}/boards/join/${board.share_id}`
		: "";

	const copyShareUrl = () => {
		if (shareUrl) {
			navigator.clipboard.writeText(shareUrl);
			setCopied(true);
			toast("Link copied!");
			setTimeout(() => setCopied(false), 2000);
		}
	};

	// Auto-end voting timer
	const [gracePeriodTimer, setGracePeriodTimer] =
		useState<NodeJS.Timeout | null>(null);
	const [showGracePeriod, setShowGracePeriod] = useState(false);
	const [gracePeriodSeconds, setGracePeriodSeconds] = useState(30);

	// Check if all votes are used
	const checkVotingComplete = useCallback(async () => {
		if (board?.phase !== "voting" || !isOwner) return;

		try {
			const response = await fetch(`/api/boards/${boardId}/voting-status`);
			if (response.ok) {
				const data = await response.json();

				if (data.allVotesUsed && !gracePeriodTimer) {
					// Start 30-second grace period
					setShowGracePeriod(true);
					setGracePeriodSeconds(30);

					toast("All votes have been used! Ending voting in 30 seconds...", {
						duration: 5000,
					});

					// Countdown timer
					const countdownInterval = setInterval(() => {
						setGracePeriodSeconds((prev) => {
							if (prev <= 1) {
								clearInterval(countdownInterval);
								return 0;
							}
							return prev - 1;
						});
					}, 1000);

					// Set timer to auto-end voting after 30 seconds
					const timer = setTimeout(async () => {
						clearInterval(countdownInterval);
						setShowGracePeriod(false);
						setGracePeriodTimer(null);

						// Auto-end voting phase
						const endResponse = await fetch(
							`/api/boards/${boardId}/voting-status`,
							{
								method: "POST",
							},
						);

						if (endResponse.ok) {
							queryClient.invalidateQueries({ queryKey: ["board", boardId] });
							toast("Voting phase ended automatically");
						}
					}, 30000);

					setGracePeriodTimer(timer);
				}
			}
		} catch (error) {
			console.error("Error checking voting status:", error);
		}
	}, [board?.phase, isOwner, boardId, gracePeriodTimer, queryClient]);

	// Clear grace period timer on phase change or unmount
	useEffect(() => {
		if (board?.phase !== "voting" && gracePeriodTimer) {
			clearTimeout(gracePeriodTimer);
			setGracePeriodTimer(null);
			setShowGracePeriod(false);
		}

		return () => {
			if (gracePeriodTimer) {
				clearTimeout(gracePeriodTimer);
			}
		};
	}, [board?.phase, gracePeriodTimer]);

	// Subscribe to realtime updates
	useEffect(() => {
		const boardChannel = new BoardChannel(boardId, supabase);

		boardChannel.subscribe({
			onCardCreated: () => {
				queryClient.invalidateQueries({ queryKey: ["board", boardId] });
			},
			onCardUpdated: () => {
				queryClient.invalidateQueries({ queryKey: ["board", boardId] });
			},
			onCardDeleted: () => {
				queryClient.invalidateQueries({ queryKey: ["board", boardId] });
			},
			onCardMoved: () => {
				queryClient.invalidateQueries({ queryKey: ["board", boardId] });
			},
			onCardsCombined: () => {
				queryClient.invalidateQueries({ queryKey: ["board", boardId] });
				toast("Cards have been combined");
			},
			onCardHighlighted: () => {
				// TODO: Add visual highlighting effect
				queryClient.invalidateQueries({ queryKey: ["board", boardId] });
			},
			onTimerEvent: (payload) => {
				queryClient.invalidateQueries({ queryKey: ["board", boardId] });
				if (payload.action === "start" || payload.action === "resume") {
					toast("Timer started");
				} else if (payload.action === "pause") {
					toast("Timer paused");
				} else if (payload.action === "extend") {
					toast(`Timer extended by ${payload.duration} seconds`);
				}
			},
			onPhaseChanged: (payload) => {
				queryClient.invalidateQueries({ queryKey: ["board", boardId] });
				toast(`Board moved to ${payload.newPhase} phase`);
			},
			onBoardUpdated: () => {
				queryClient.invalidateQueries({ queryKey: ["board", boardId] });
			},
			onVoteAdded: () => {
				queryClient.invalidateQueries({ queryKey: ["board", boardId] });
				// Check if all votes are used after a vote is added
				checkVotingComplete();
			},
			onVoteRemoved: () => {
				queryClient.invalidateQueries({ queryKey: ["board", boardId] });
				// Cancel grace period if a vote is removed
				if (gracePeriodTimer) {
					clearTimeout(gracePeriodTimer);
					setGracePeriodTimer(null);
					setShowGracePeriod(false);
					toast("Grace period cancelled - vote removed");
				}
			},
		});

		return () => {
			boardChannel.unsubscribe();
		};
	}, [boardId, queryClient, checkVotingComplete, gracePeriodTimer]);

	// Create column mutation
	const createColumnMutation = useMutation({
		mutationFn: async ({ name, color }: { name: string; color: string }) => {
			const position = columns.length;

			const response = await fetch(`/api/boards/${boardId}/columns`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ name, color, position }),
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || "Failed to create column");
			}

			return response.json();
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["board", boardId] });
			setColumnDialogOpen(false);
			setColumnName("");
			setColumnColor("#gray");
		},
	});

	// Delete column mutation
	const deleteColumnMutation = useMutation({
		mutationFn: async (columnId: string) => {
			const response = await fetch(
				`/api/boards/${boardId}/columns?columnId=${columnId}`,
				{
					method: "DELETE",
				},
			);

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || "Failed to delete column");
			}

			return response.json();
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["board", boardId] });
		},
	});

	// Update card position mutation
	const updateCardPositionMutation = useMutation({
		mutationFn: async ({
			cardId,
			columnId,
			position,
		}: {
			cardId: string;
			columnId: string;
			position: number;
		}) => {
			const response = await fetch(`/api/boards/${boardId}/cards`, {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ cardId, column_id: columnId, position }),
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || "Failed to update card position");
			}

			return response.json();
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["board", boardId] });
		},
	});

	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event;

		if (!over) return;

		const activeCard = columns
			.flatMap((col: ColumnWithCards) => col.cards)
			.find((card: Card & { votes: CardVote[] }) => card.id === active.id);

		if (!activeCard) return;

		const overId = over.id as string;
		const overColumn = columns.find(
			(col: ColumnWithCards) =>
				col.id === overId ||
				col.cards.some(
					(card: Card & { votes: CardVote[] }) => card.id === overId,
				),
		);

		if (!overColumn) return;

		// Check if trying to move to action column as non-owner
		const isOwner =
			currentUser?.id === board?.owner_id ||
			(anonymousData?.user && board?.owner_id === anonymousData.user.id);

		if (overColumn.is_action && !isOwner) {
			toast.error("Only board owners can move cards to action columns");
			setActiveCard(null);
			return;
		}

		// Determine target position
		const targetColumnId = overColumn.id;
		let targetPosition = 0;

		if (overId === overColumn.id) {
			// Dropped on column itself - add to end
			targetPosition = overColumn.cards.length;
		} else {
			// Dropped on a card
			const overCardIndex = overColumn.cards.findIndex(
				(card: Card & { votes: CardVote[] }) => card.id === overId,
			);
			targetPosition = overCardIndex;

			// If moving within same column and dragging down, adjust position
			if (activeCard.column_id === overColumn.id) {
				const activeIndex = overColumn.cards.findIndex(
					(card: Card & { votes: CardVote[] }) => card.id === active.id,
				);
				if (activeIndex < overCardIndex) {
					targetPosition--;
				}
			}
		}

		// Update positions
		updateCardPositionMutation.mutate({
			cardId: activeCard.id,
			columnId: targetColumnId,
			position: targetPosition,
		});

		setActiveCard(null);
	};

	if (!isLoaded || boardLoading || (user && !syncedUser)) {
		return (
			<div className="container mx-auto py-8">
				<div className="flex h-64 items-center justify-center">
					<p className="text-muted-foreground">Loading board...</p>
				</div>
			</div>
		);
	}

	if (!user && !anonymousData?.user) {
		return (
			<div className="container mx-auto py-8">
				<div className="flex h-64 items-center justify-center">
					<p className="text-muted-foreground">
						Please sign in or join via share link to view this board
					</p>
				</div>
			</div>
		);
	}

	if (boardError) {
		return (
			<div className="container mx-auto py-8">
				<div className="flex h-64 items-center justify-center">
					<p className="text-red-500">Error: {boardError.message}</p>
				</div>
			</div>
		);
	}

	if (!board) {
		return (
			<div className="container mx-auto py-8">
				<div className="flex h-64 items-center justify-center">
					<p className="text-muted-foreground">Board not found</p>
				</div>
			</div>
		);
	}

	return (
		<div className="flex h-screen flex-col">
			<div className="border-b p-4">
				<div className="container mx-auto flex items-center justify-between">
					<div>
						<h1 className="font-bold text-2xl">{board.name}</h1>
						{board.description && (
							<p className="text-muted-foreground">{board.description}</p>
						)}
					</div>
					<div className="flex items-center gap-2">
						{isOwner && board.phase === "setup" && (
							<Dialog
								open={columnDialogOpen}
								onOpenChange={setColumnDialogOpen}
							>
								<DialogTrigger asChild>
									<Button>
										<Plus className="mr-2 h-4 w-4" />
										Add Column
									</Button>
								</DialogTrigger>
								<DialogContent>
									<DialogHeader>
										<DialogTitle>Add Column</DialogTitle>
										<DialogDescription>
											Create a new column for your retro board.
										</DialogDescription>
									</DialogHeader>
									<div className="grid gap-4 py-4">
										<div className="grid gap-2">
											<Label htmlFor="name">Column Name</Label>
											<Input
												id={`${elemId}-name`}
												value={columnName}
												onChange={(e) => setColumnName(e.target.value)}
												placeholder="What went well?"
											/>
										</div>
										<div className="grid gap-2">
											<Label htmlFor="color">Color</Label>
											<Input
												id={`${elemId}-color`}
												type="color"
												value={columnColor}
												onChange={(e) => setColumnColor(e.target.value)}
											/>
										</div>
									</div>
									<DialogFooter>
										<Button
											variant="outline"
											onClick={() => setColumnDialogOpen(false)}
										>
											Cancel
										</Button>
										<Button
											onClick={() =>
												createColumnMutation.mutate({
													name: columnName,
													color: columnColor,
												})
											}
											disabled={
												!columnName.trim() || createColumnMutation.isPending
											}
										>
											{createColumnMutation.isPending
												? "Creating..."
												: "Create Column"}
										</Button>
									</DialogFooter>
								</DialogContent>
							</Dialog>
						)}
						<Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
							<DialogTrigger asChild>
								<Button variant="outline">
									<Share2 className="mr-2 h-4 w-4" />
									Share
								</Button>
							</DialogTrigger>
							<DialogContent>
								<DialogHeader>
									<DialogTitle>Share Board</DialogTitle>
									<DialogDescription>
										Share this link with others to let them join this board
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
						<BoardSettings board={board} isOwner={isOwner} />
					</div>
				</div>
			</div>

			<div className="flex flex-1 overflow-hidden">
				<div className="flex-1 overflow-x-auto">
					<div className="container mx-auto p-4">
						<DndContext
							collisionDetection={closestCenter}
							onDragStart={(event) => {
								const card = columns
									.flatMap((col: ColumnWithCards) => col.cards)
									.find(
										(card: Card & { votes: CardVote[] }) =>
											card.id === event.active.id,
									);
								setActiveCard(card || null);
							}}
							onDragEnd={handleDragEnd}
						>
							<div className="flex h-full gap-4">
								{columns.map((column: ColumnWithCards) => (
									<BoardColumn
										key={column.id}
										column={column}
										currentUserId={currentUser?.id || anonymousData?.user?.id}
										boardId={boardId}
										onDeleteColumn={
											isOwner
												? () => deleteColumnMutation.mutate(column.id)
												: undefined
										}
										isOwner={isOwner}
										anonymousUser={anonymousData?.user}
										boardPhase={board.phase}
										phaseStartedAt={board.phase_started_at}
										phaseEndsAt={board.phase_ends_at}
									/>
								))}
							</div>
							<DragOverlay>
								{activeCard ? (
									<CardComponent
										card={activeCard}
										boardId={boardId}
										isDragging
									/>
								) : null}
							</DragOverlay>
						</DndContext>
					</div>
				</div>

				<div className="w-80 overflow-y-auto border-l p-4">
					<BoardTimer board={board} isOwner={isOwner} />

					{/* Grace period countdown */}
					{showGracePeriod && board?.phase === "voting" && (
						<div className="mt-4 rounded-lg border-2 border-orange-500 bg-orange-50 p-4">
							<div className="text-center">
								<p className="font-semibold text-orange-900 text-sm">
									All votes used!
								</p>
								<p className="mt-1 text-orange-700 text-xs">
									Voting will end automatically in:
								</p>
								<p className="mt-2 font-bold text-2xl text-orange-900">
									{gracePeriodSeconds}s
								</p>
								{isOwner && (
									<button
										type="button"
										onClick={() => {
											if (gracePeriodTimer) {
												clearTimeout(gracePeriodTimer);
												setGracePeriodTimer(null);
												setShowGracePeriod(false);
												toast("Grace period cancelled");
											}
										}}
										className="mt-3 text-orange-600 text-xs underline hover:text-orange-800"
									>
										Cancel auto-end
									</button>
								)}
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
