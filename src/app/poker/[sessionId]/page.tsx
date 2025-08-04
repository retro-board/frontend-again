"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/nextjs";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "~/components/ui/dialog";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { Badge } from "~/components/ui/badge";
import { Separator } from "~/components/ui/separator";
import { Plus, Users, Eye, EyeOff, ChevronRight, Check } from "lucide-react";
import { supabase } from "~/lib/supabase/client";
import { VoteCard } from "~/components/poker/VoteCard";
import { ParticipantList } from "~/components/poker/ParticipantList";
import type { PokerSession, Story, User, PokerVote, EstimationType } from "~/types/database";
import { ESTIMATION_VALUES } from "~/types/database";
import { useUserSync } from "~/hooks/useUserSync";

interface SessionData extends PokerSession {
  stories: (Story & {
    votes: (PokerVote & { user: User })[];
  })[];
  participants: {
    user: User;
    role: string;
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
  const { data: sessionData, isLoading, error: sessionError } = useQuery({
    queryKey: ["poker-session", sessionId, user?.id],
    queryFn: async () => {
      if (!user) throw new Error("Not authenticated");
      
      const response = await fetch(`/api/poker-sessions/${sessionId}`);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to fetch session");
      }
      
      return response.json();
    },
    enabled: !!user && isLoaded,
  });

  const session = sessionData?.session as SessionData | undefined;

  // Subscribe to realtime updates
  useEffect(() => {
    const channel = supabase
      .channel(`poker:${sessionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "poker_sessions", filter: `id=eq.${sessionId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["poker-session", sessionId] });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stories", filter: `session_id=eq.${sessionId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["poker-session", sessionId] });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "poker_votes" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["poker-session", sessionId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, queryClient]);

  // Get current story
  const currentStory = session?.stories.find(s => s.id === session.current_story_id);
  
  // Check if user is facilitator
  const isFacilitator = session?.participants.some(
    p => p.user.id === currentUser?.id && p.role === "facilitator"
  );

  // Get user's vote for current story
  const userVote = currentStory?.votes.find(v => v.user_id === currentUser?.id);

  // Create story mutation
  const createStoryMutation = useMutation({
    mutationFn: async ({ title, description }: { title: string; description?: string }) => {
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
    mutationFn: async ({ storyId, vote }: { storyId: string; vote: string }) => {
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
          reveal_votes: false 
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
          reveal_votes: !session?.reveal_votes 
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
    mutationFn: async ({ storyId, estimate }: { storyId: string; estimate: string }) => {
      const response = await fetch(`/api/poker-sessions/${sessionId}/stories`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          storyId,
          final_estimate: estimate 
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
    if (currentStory && currentUser) {
      setSelectedVote(vote);
      voteMutation.mutate({ storyId: currentStory.id, vote });
    }
  };

  const estimationValues = ESTIMATION_VALUES[session?.estimation_type || "fibonacci"];

  if (!isLoaded || isLoading || (user && !syncedUser)) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading session...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Please sign in to view this session</p>
        </div>
      </div>
    );
  }

  if (sessionError) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-center h-64">
          <p className="text-red-500">Error: {sessionError.message}</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Session not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">{session.name}</h1>
          {session.description && (
            <p className="text-muted-foreground mt-1">{session.description}</p>
          )}
        </div>
        {isFacilitator && (
          <Dialog open={storyDialogOpen} onOpenChange={setStoryDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
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
                    id="title"
                    value={storyTitle}
                    onChange={(e) => setStoryTitle(e.target.value)}
                    placeholder="As a user, I want to..."
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="description">Description (optional)</Label>
                  <Textarea
                    id="description"
                    value={storyDescription}
                    onChange={(e) => setStoryDescription(e.target.value)}
                    placeholder="Additional details about the story"
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setStoryDialogOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={() => createStoryMutation.mutate({ title: storyTitle, description: storyDescription })}
                  disabled={!storyTitle.trim() || createStoryMutation.isPending}
                >
                  {createStoryMutation.isPending ? "Adding..." : "Add Story"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          {/* Current Story */}
          {currentStory ? (
            <Card>
              <CardHeader>
                <CardTitle>Current Story</CardTitle>
                <CardDescription>{currentStory.title}</CardDescription>
                {currentStory.description && (
                  <p className="text-sm mt-2">{currentStory.description}</p>
                )}
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 mb-6">
                  {estimationValues.map((value) => (
                    <VoteCard
                      key={value}
                      value={value}
                      selected={selectedVote === value || userVote?.vote_value === value}
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
                          <EyeOff className="w-4 h-4 mr-2" />
                          Hide Votes
                        </>
                      ) : (
                        <>
                          <Eye className="w-4 h-4 mr-2" />
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
                              estimate: consensus 
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
                    <h4 className="font-semibold mb-3">Votes:</h4>
                    <div className="space-y-2">
                      {currentStory.votes.map((vote) => (
                        <div key={vote.id} className="flex items-center justify-between">
                          <span className="text-sm">{vote.user.name || vote.user.email}</span>
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
              <CardContent className="flex items-center justify-center h-64">
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
                  <div
                    key={story.id}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      story.id === currentStory?.id 
                        ? "bg-primary/10 border-primary" 
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
                          <p className="text-sm text-muted-foreground mt-1">
                            {story.description}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {story.is_estimated && (
                          <Badge variant="secondary">
                            <Check className="w-3 h-3 mr-1" />
                            {story.final_estimate}
                          </Badge>
                        )}
                        {story.id === currentStory?.id && (
                          <ChevronRight className="w-4 h-4 text-primary" />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {session.stories.length === 0 && (
                  <p className="text-muted-foreground text-center py-8">
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
            currentStory={currentStory}
            showVotes={session.reveal_votes}
          />
        </div>
      </div>
    </div>
  );
}