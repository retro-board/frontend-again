"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Edit2, EyeOff, ThumbsUp, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { CardContent, Card as UICard } from "~/components/ui/card";
import { Textarea } from "~/components/ui/textarea";
import { cn } from "~/lib/utils";
import type { Board, Card as CardType, CardVote } from "~/types/database";

interface CardProps {
	card: CardType & { votes?: CardVote[] };
	currentUserId?: string;
	boardId: string;
	isDragging?: boolean;
	boardPhase?: Board["phase"];
}

export function Card({
	card,
	currentUserId,
	boardId,
	isDragging,
	boardPhase,
}: CardProps) {
	const queryClient = useQueryClient();
	const [isEditing, setIsEditing] = useState(false);
	const [editContent, setEditContent] = useState(card.content);

	const { attributes, listeners, setNodeRef, transform, transition } =
		useSortable({ id: card.id });

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	};

	const userVoted = card.votes?.some((vote) => vote.user_id === currentUserId);
	const voteCount = card.votes?.length || 0;

	const updateCardMutation = useMutation({
		mutationFn: async (content: string) => {
			const response = await fetch(`/api/boards/${boardId}/cards`, {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ cardId: card.id, content }),
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || "Failed to update card");
			}

			return response.json();
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["board"] });
			setIsEditing(false);
		},
	});

	const deleteCardMutation = useMutation({
		mutationFn: async () => {
			const response = await fetch(
				`/api/boards/${boardId}/cards?cardId=${card.id}`,
				{
					method: "DELETE",
				},
			);

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || "Failed to delete card");
			}

			return response.json();
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["board"] });
		},
	});

	const toggleVoteMutation = useMutation({
		mutationFn: async () => {
			if (!currentUserId) throw new Error("User not authenticated");

			const response = await fetch(
				`/api/boards/${boardId}/cards/${card.id}/votes`,
				{
					method: "POST",
				},
			);

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || "Failed to toggle vote");
			}

			return response.json();
		},
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: ["board"] });
			if (data.remainingVotes !== undefined) {
				toast(`${data.remainingVotes} votes remaining`);
			}
		},
		onError: (error: Error) => {
			toast.error(error.message);
		},
	});

	const handleSaveEdit = () => {
		if (editContent.trim() && editContent !== card.content) {
			updateCardMutation.mutate(editContent);
		} else {
			setIsEditing(false);
			setEditContent(card.content);
		}
	};

	const isOwner = currentUserId === card.author_id;
	const isMasked = card.is_masked && boardPhase === "creation" && !isOwner;

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={cn(isDragging && "opacity-50")}
		>
			<UICard className="cursor-move" {...attributes} {...listeners}>
				<CardContent className="p-3">
					{isMasked ? (
						<div className="flex h-20 items-center justify-center text-muted-foreground">
							<EyeOff className="mr-2 h-4 w-4" />
							<span className="text-sm">Hidden during creation</span>
						</div>
					) : isEditing ? (
						<div className="space-y-2">
							<Textarea
								value={editContent}
								onChange={(e) => setEditContent(e.target.value)}
								className="resize-none"
								rows={3}
								autoFocus
								onClick={(e) => e.stopPropagation()}
								onPointerDown={(e) => e.stopPropagation()}
							/>
							<div className="flex gap-1">
								<Button
									size="sm"
									variant="ghost"
									onClick={(e) => {
										e.stopPropagation();
										handleSaveEdit();
									}}
									onPointerDown={(e) => e.stopPropagation()}
								>
									<Check className="h-4 w-4" />
								</Button>
								<Button
									size="sm"
									variant="ghost"
									onClick={(e) => {
										e.stopPropagation();
										setIsEditing(false);
										setEditContent(card.content);
									}}
									onPointerDown={(e) => e.stopPropagation()}
								>
									<X className="h-4 w-4" />
								</Button>
							</div>
						</div>
					) : (
						<>
							<p className="mb-2 whitespace-pre-wrap text-sm">{card.content}</p>
							<div className="flex items-center justify-between">
								{boardPhase === "voting" && (
									<Button
										size="sm"
										variant="ghost"
										className={cn("h-8 px-2", userVoted && "text-primary")}
										onClick={(e) => {
											e.stopPropagation();
											toggleVoteMutation.mutate();
										}}
										onPointerDown={(e) => e.stopPropagation()}
									>
										<ThumbsUp className="mr-1 h-3 w-3" />
										{voteCount}
									</Button>
								)}
								{boardPhase !== "voting" && voteCount > 0 && (
									<div className="flex items-center text-muted-foreground text-sm">
										<ThumbsUp className="mr-1 h-3 w-3" />
										{voteCount}
									</div>
								)}
								{isOwner && (
									<div className="flex gap-1">
										<Button
											size="sm"
											variant="ghost"
											className="h-8 w-8 p-0"
											onClick={(e) => {
												e.stopPropagation();
												setIsEditing(true);
											}}
											onPointerDown={(e) => e.stopPropagation()}
										>
											<Edit2 className="h-3 w-3" />
										</Button>
										<Button
											size="sm"
											variant="ghost"
											className="h-8 w-8 p-0"
											onClick={(e) => {
												e.stopPropagation();
												deleteCardMutation.mutate();
											}}
											onPointerDown={(e) => e.stopPropagation()}
										>
											<Trash2 className="h-3 w-3" />
										</Button>
									</div>
								)}
							</div>
						</>
					)}
				</CardContent>
			</UICard>
		</div>
	);
}
