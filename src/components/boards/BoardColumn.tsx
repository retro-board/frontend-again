"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Card as UICard, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "~/lib/supabase/client";
import { Card } from "./Card";
import type { ColumnWithCards } from "~/types/database";

interface BoardColumnProps {
  column: ColumnWithCards;
  currentUserId?: string;
  boardId: string;
  onDeleteColumn: () => void;
}

export function BoardColumn({ column, currentUserId, boardId, onDeleteColumn }: BoardColumnProps) {
  const queryClient = useQueryClient();
  const [isAddingCard, setIsAddingCard] = useState(false);
  const [newCardContent, setNewCardContent] = useState("");
  
  const { setNodeRef } = useDroppable({
    id: column.id,
  });

  const createCardMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!currentUserId) throw new Error("User not authenticated");
      
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
    if (newCardContent.trim() && currentUserId) {
      createCardMutation.mutate(newCardContent);
    }
  };

  return (
    <div className="flex-shrink-0 w-80">
      <UICard className="h-full">
        <CardHeader 
          className="p-4"
          style={{ backgroundColor: `${column.color}20` }}
        >
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">{column.name}</CardTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={onDeleteColumn}
              className="h-8 w-8"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-4" ref={setNodeRef}>
          <SortableContext
            items={column.cards.map(card => card.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {column.cards.map((card) => (
                <Card
                  key={card.id}
                  card={card}
                  currentUserId={currentUserId}
                  boardId={boardId}
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
                  disabled={!newCardContent.trim() || createCardMutation.isPending}
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
            <Button
              variant="ghost"
              className="w-full mt-2 justify-start"
              onClick={() => setIsAddingCard(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add a card
            </Button>
          )}
        </CardContent>
      </UICard>
    </div>
  );
}