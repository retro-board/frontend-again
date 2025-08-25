"use client";

import { useDroppable } from "@dnd-kit/core";
import {
	SortableContext,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Target, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import {
	CardContent,
	CardHeader,
	CardTitle,
	Card as UICard,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { cn } from "~/lib/utils";
import type { AnonymousUser, Board, ColumnWithCards } from "~/types/database";
import { Card } from "./Card";

interface BoardColumnProps {
	column: ColumnWithCards;
	currentUserId?: string;
	boardId: string;
	onDeleteColumn?: () => void;
	isOwner?: boolean;
	anonymousUser?: AnonymousUser;
	boardPhase?: Board["phase"];
	phaseStartedAt?: Date | string | null;
	phaseEndsAt?: Date | string | null;
}

export function BoardColumn({
	column,
	currentUserId,
	boardId,
	onDeleteColumn,
	isOwner,
	anonymousUser,
	boardPhase,
	phaseStartedAt,
	phaseEndsAt,
}: BoardColumnProps) {
	const queryClient = useQueryClient();
	const [isAddingCard, setIsAddingCard] = useState(false);
	const [newCardContent, setNewCardContent] = useState("");

	// Disable dropping on action columns for non-owners
	const isDropDisabled = column.is_action && !isOwner;

	const { setNodeRef } = useDroppable({
		id: column.id,
		disabled: isDropDisabled,
	});

	const createCardMutation = useMutation({
		mutationFn: async (content: string) => {
			if (!currentUserId && !anonymousUser)
				throw new Error("User not authenticated");

			const position = column.cards.length;

			const response = await fetch(`/api/boards/${boardId}/cards`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					column_id: column.id,
					content,
					position,
					is_anonymous: !!anonymousUser,
				}),
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || "Failed to create card");
			}

			return response.json();
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["board"] });
			setNewCardContent("");
			setIsAddingCard(false);
		},
	});

	const handleAddCard = () => {
		if (newCardContent.trim() && (currentUserId || anonymousUser)) {
			createCardMutation.mutate(newCardContent);
		}
	};

	return (
		<div className="w-80 flex-shrink-0">
			<UICard className="h-full">
				<CardHeader
					className="p-4"
					style={{ backgroundColor: `${column.color}20` }}
				>
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							{column.is_action && (
								<div className="flex items-center gap-1">
									<Target className="h-4 w-4" />
									<span className="font-medium text-muted-foreground text-xs">
										(Required)
									</span>
								</div>
							)}
							<CardTitle className="text-lg">{column.name}</CardTitle>
						</div>
						{isOwner && onDeleteColumn && !column.is_action && (
							<Button
								variant="ghost"
								size="icon"
								onClick={onDeleteColumn}
								className="h-8 w-8"
								title="Delete column"
							>
								<Trash2 className="h-4 w-4" />
							</Button>
						)}
					</div>
				</CardHeader>
				<CardContent
					className={cn("p-4", isDropDisabled && "bg-muted/50 opacity-50")}
					ref={setNodeRef}
				>
					{isDropDisabled && !isOwner && (
						<div className="mb-2 rounded-md bg-yellow-100 p-2 text-center text-sm text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200">
							Only board owners can move cards to action columns
						</div>
					)}
					<SortableContext
						items={column.cards.map((card) => card.id)}
						strategy={verticalListSortingStrategy}
					>
						<div className="space-y-2">
							{column.cards.map((card) => (
								<Card
									key={card.id}
									card={card}
									currentUserId={currentUserId}
									currentAnonymousUserId={anonymousUser?.id}
									boardId={boardId}
									boardPhase={boardPhase}
									isActionColumn={column.is_action}
								/>
							))}
						</div>
					</SortableContext>

					{isAddingCard ? (
						<div className="mt-2 space-y-2">
							<Input
								value={newCardContent}
								onChange={(e) => setNewCardContent(e.target.value)}
								placeholder="Enter card content..."
								onKeyDown={(e) => {
									if (e.key === "Enter" && !e.shiftKey) {
										e.preventDefault();
										handleAddCard();
									}
									if (e.key === "Escape") {
										setIsAddingCard(false);
										setNewCardContent("");
									}
								}}
								autoFocus
							/>
							<div className="flex gap-2">
								<Button
									size="sm"
									onClick={handleAddCard}
									disabled={
										!newCardContent.trim() || createCardMutation.isPending
									}
								>
									Add
								</Button>
								<Button
									size="sm"
									variant="outline"
									onClick={() => {
										setIsAddingCard(false);
										setNewCardContent("");
									}}
								>
									Cancel
								</Button>
							</div>
						</div>
					) : (
						<>
							{/* During setup phase, only show add button for action columns */}
							{boardPhase === "setup" && !column.is_action ? (
								<div className="mt-2 rounded-md bg-muted p-2 text-center text-muted-foreground text-sm">
									Cards can only be added to action columns during setup
								</div>
							) : boardPhase === "join" ? (
								<div className="mt-2 rounded-md bg-muted p-2 text-center text-muted-foreground text-sm">
									Waiting for all participants to join
								</div>
							) : boardPhase === "creation" &&
								!column.is_action &&
								!phaseStartedAt ? (
								<div className="mt-2 rounded-md bg-muted p-2 text-center text-muted-foreground text-sm">
									Waiting for timer to start
								</div>
							) : boardPhase === "creation" &&
								!column.is_action &&
								phaseStartedAt &&
								!phaseEndsAt ? (
								<div className="mt-2 rounded-md bg-muted p-2 text-center text-muted-foreground text-sm">
									Timer is paused - cards cannot be added
								</div>
							) : boardPhase === "voting" && phaseStartedAt && !phaseEndsAt ? (
								<div className="mt-2 rounded-md bg-muted p-2 text-center text-muted-foreground text-sm">
									Voting is paused
								</div>
							) : boardPhase === "reveal" || boardPhase === "voting" ? (
								<div className="mt-2 rounded-md bg-muted p-2 text-center text-muted-foreground text-sm">
									Cards cannot be added during {boardPhase}
								</div>
							) : boardPhase === "discussion" && !column.is_action ? (
								<div className="mt-2 rounded-md bg-muted p-2 text-center text-muted-foreground text-sm">
									Only action items can be added during discussion
								</div>
							) : boardPhase === "completed" ? (
								<div className="mt-2 rounded-md bg-muted p-2 text-center text-muted-foreground text-sm">
									Board is completed
								</div>
							) : column.is_action ? (
								isOwner && (
									<Button
										variant="ghost"
										className="mt-2 w-full justify-start"
										onClick={() => setIsAddingCard(true)}
									>
										<Plus className="mr-2 h-4 w-4" />
										Add a card
									</Button>
								)
							) : (
								<Button
									variant="ghost"
									className="mt-2 w-full justify-start"
									onClick={() => setIsAddingCard(true)}
								>
									<Plus className="mr-2 h-4 w-4" />
									Add a card
								</Button>
							)}
						</>
					)}
				</CardContent>
			</UICard>
		</div>
	);
}
