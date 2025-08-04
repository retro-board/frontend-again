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
import { useEffect, useState } from "react";
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
import { supabase } from "~/lib/supabase/client";
import type { Card, User } from "~/types/database";

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
	});

	const board = boardData?.board;
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

	// Subscribe to realtime updates
	useEffect(() => {
		const channel = supabase
			.channel(`board:${boardId}`)
			.on(
				"postgres_changes",
				{
					event: "*",
					schema: "public",
					table: "columns",
					filter: `board_id=eq.${boardId}`,
				},
				() => {
					queryClient.invalidateQueries({ queryKey: ["board", boardId] });
				},
			)
			.on(
				"postgres_changes",
				{ event: "*", schema: "public", table: "cards" },
				() => {
					queryClient.invalidateQueries({ queryKey: ["board", boardId] });
				},
			)
			.subscribe();

		return () => {
			supabase.removeChannel(channel);
		};
	}, [boardId, queryClient]);

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
			.flatMap((col) => col.cards)
			.find((card) => card.id === active.id);

		if (!activeCard) return;

		const overId = over.id as string;
		const overColumn = columns.find(
			// biome-ignore lint/suspicious/noExplicitAny: any
			(col: { id: string; cards: any[] }) =>
				col.id === overId || col.cards.some((card) => card.id === overId),
		);

		if (!overColumn) return;

		// Determine target position
		const targetColumnId = overColumn.id;
		let targetPosition = 0;

		if (overId === overColumn.id) {
			// Dropped on column itself - add to end
			targetPosition = overColumn.cards.length;
		} else {
			// Dropped on a card
			const overCardIndex = overColumn.cards.findIndex(
				(card) => card.id === overId,
			);
			targetPosition = overCardIndex;

			// If moving within same column and dragging down, adjust position
			if (activeCard.column_id === overColumn.id) {
				const activeIndex = overColumn.cards.findIndex(
					(card) => card.id === active.id,
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
						{isOwner && (
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
												id="name"
												value={columnName}
												onChange={(e) => setColumnName(e.target.value)}
												placeholder="What went well?"
											/>
										</div>
										<div className="grid gap-2">
											<Label htmlFor="color">Color</Label>
											<Input
												id="color"
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
									.flatMap((col) => col.cards)
									.find((card) => card.id === event.active.id);
								setActiveCard(card || null);
							}}
							onDragEnd={handleDragEnd}
						>
							<div className="flex h-full gap-4">
								{columns.map((column) => (
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
				</div>
			</div>
		</div>
	);
}
