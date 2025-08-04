"use client";

import { useUser } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Calendar, Plus, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
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
import type { Board, BoardWithParticipants } from "~/types/database";

export default function BoardsPage() {
	const router = useRouter();
	const { user, isLoaded } = useUser();
	const { syncedUser, syncError } = useUserSync();
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");

	const { data: boards, isLoading } = useQuery({
		queryKey: ["boards", user?.id, syncedUser?.id],
		queryFn: async () => {
			if (!user || !syncedUser) return [];

			// Fetch boards
			const { data, error } = await supabase
				.from("boards")
				.select(`
          *,
          participants:board_participants(
            *,
            user:users(*)
          )
        `)
				.order("created_at", { ascending: false });

			if (error) throw error;
			return data as BoardWithParticipants[];
		},
		enabled: !!user && !!syncedUser,
	});

	const createBoardMutation = useMutation({
		mutationFn: async ({
			name,
			description,
		}: {
			name: string;
			description?: string;
		}) => {
			if (!user) throw new Error("User not authenticated");

			// Use API route to create board (bypasses RLS)
			const response = await fetch("/api/boards", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ name, description }),
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || "Failed to create board");
			}

			const data = await response.json();
			return data.board;
		},
		onSuccess: (board) => {
			queryClient.invalidateQueries({ queryKey: ["boards"] });
			setOpen(false);
			setName("");
			setDescription("");
			router.push(`/boards/${board.id}`);
		},
		onError: (error) => {
			console.error("Mutation error:", error);
			toast.error("Failed to create board. Check console for details.");
		},
	});

	const handleCreateBoard = () => {
		console.log("Creating board with name:", name);
		if (name.trim()) {
			createBoardMutation.mutate({ name, description });
		}
	};

	if (!isLoaded || isLoading || (user && !syncedUser)) {
		return (
			<div className="container mx-auto py-8">
				<div className="flex h-64 items-center justify-center">
					<p className="text-muted-foreground">Loading...</p>
				</div>
			</div>
		);
	}

	if (syncError) {
		return (
			<div className="container mx-auto py-8">
				<div className="flex h-64 items-center justify-center">
					<div className="text-center">
						<p className="mb-4 text-red-500">
							Error syncing user: {syncError.message}
						</p>
						<Button onClick={() => window.location.reload()}>Retry</Button>
					</div>
				</div>
			</div>
		);
	}

	if (isLoaded && !user) {
		return (
			<div className="container mx-auto py-8">
				<div className="flex h-64 items-center justify-center">
					<div className="text-center">
						<p className="mb-4 text-muted-foreground">
							Please sign in to view boards
						</p>
						<Button onClick={() => router.push("/sign-in")}>Sign In</Button>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="container mx-auto py-8">
			<div className="mb-8 flex items-center justify-between">
				<h1 className="font-bold text-3xl">Retro Boards</h1>
				<Dialog open={open} onOpenChange={setOpen}>
					<DialogTrigger asChild>
						<Button>
							<Plus className="mr-2 h-4 w-4" />
							New Board
						</Button>
					</DialogTrigger>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Create New Board</DialogTitle>
							<DialogDescription>
								Create a new retro board for your team to collaborate.
							</DialogDescription>
						</DialogHeader>
						<div className="grid gap-4 py-4">
							<div className="grid gap-2">
								<Label htmlFor="name">Board Name</Label>
								<Input
									id="name"
									value={name}
									onChange={(e) => setName(e.target.value)}
									placeholder="Sprint 23 Retrospective"
								/>
							</div>
							<div className="grid gap-2">
								<Label htmlFor="description">Description (optional)</Label>
								<Textarea
									id="description"
									value={description}
									onChange={(e) => setDescription(e.target.value)}
									placeholder="Retrospective for the end of Sprint 23"
									rows={3}
								/>
							</div>
						</div>
						<DialogFooter>
							<Button variant="outline" onClick={() => setOpen(false)}>
								Cancel
							</Button>
							<Button
								onClick={handleCreateBoard}
								disabled={!name.trim() || createBoardMutation.isPending}
							>
								{createBoardMutation.isPending ? "Creating..." : "Create Board"}
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</div>

			{boards?.length === 0 ? (
				<Card>
					<CardContent className="flex h-64 flex-col items-center justify-center">
						<p className="mb-4 text-muted-foreground">No boards yet</p>
						<Button onClick={() => setOpen(true)}>
							<Plus className="mr-2 h-4 w-4" />
							Create your first board
						</Button>
					</CardContent>
				</Card>
			) : (
				<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
					{boards?.map((board) => (
						<Card
							key={board.id}
							className="cursor-pointer transition-shadow hover:shadow-lg"
							onClick={() => router.push(`/boards/${board.id}`)}
						>
							<CardHeader>
								<CardTitle>{board.name}</CardTitle>
								{board.description && (
									<CardDescription>{board.description}</CardDescription>
								)}
							</CardHeader>
							<CardContent>
								<div className="flex items-center gap-4 text-muted-foreground text-sm">
									<div className="flex items-center gap-1">
										<Users className="h-4 w-4" />
										<span>{board.participants?.length || 0} participants</span>
									</div>
									<div className="flex items-center gap-1">
										<Calendar className="h-4 w-4" />
										<span>
											{new Date(board.created_at).toLocaleDateString()}
										</span>
									</div>
								</div>
							</CardContent>
						</Card>
					))}
				</div>
			)}
		</div>
	);
}
