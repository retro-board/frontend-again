"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "~/components/ui/button";
import { Card as UICard, CardContent } from "~/components/ui/card";
import { Textarea } from "~/components/ui/textarea";
import { ThumbsUp, Edit2, Trash2, Check, X } from "lucide-react";
import { cn } from "~/lib/utils";
import { supabase } from "~/lib/supabase/client";
import type { Card as CardType, CardVote } from "~/types/database";

interface CardProps {
  card: CardType & { votes?: CardVote[] };
  currentUserId?: string;
  boardId: string;
  isDragging?: boolean;
}

export function Card({ card, currentUserId, boardId, isDragging }: CardProps) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(card.content);
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const userVoted = card.votes?.some(vote => vote.user_id === currentUserId);
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
      const response = await fetch(`/api/boards/${boardId}/cards?cardId=${card.id}`, {
        method: "DELETE",
      });

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
      
      const response = await fetch(`/api/boards/${boardId}/cards/${card.id}/votes`, {
        method: "POST",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to toggle vote");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["board"] });
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(isDragging && "opacity-50")}
    >
      <UICard className="cursor-move" {...attributes} {...listeners}>
        <CardContent className="p-3">
          {isEditing ? (
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
              <p className="text-sm whitespace-pre-wrap mb-2">{card.content}</p>
              <div className="flex items-center justify-between">
                <Button
                  size="sm"
                  variant="ghost"
                  className={cn(
                    "h-8 px-2",
                    userVoted && "text-primary"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleVoteMutation.mutate();
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <ThumbsUp className="h-3 w-3 mr-1" />
                  {voteCount}
                </Button>
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