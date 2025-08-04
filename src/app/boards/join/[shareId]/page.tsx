"use client";

import { useUser } from "@clerk/nextjs";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "~/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { useUserSync } from "~/hooks/useUserSync";

export default function JoinBoardPage() {
	const params = useParams();
	const shareId = params.shareId as string;
	const router = useRouter();
	const { user, isLoaded } = useUser();
	const { syncedUser } = useUserSync();
	const [displayName, setDisplayName] = useState("");

	// Check for existing anonymous user
	const { data: anonymousData } = useQuery({
		queryKey: ["anonymous-user"],
		queryFn: async () => {
			const response = await fetch("/api/anonymous/current");
			if (!response.ok) throw new Error("Failed to fetch anonymous user");
			return response.json();
		},
		enabled: !user,
	});

	// Get board by share ID
	const { data: boardData, isLoading } = useQuery({
		queryKey: ["board-share", shareId],
		queryFn: async () => {
			const response = await fetch(`/api/boards/share/${shareId}`);
			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || "Board not found");
			}
			return response.json();
		},
	});

	// Create anonymous user mutation
	const createAnonymousUserMutation = useMutation({
		mutationFn: async (name: string) => {
			const response = await fetch("/api/anonymous/create", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ displayName: name }),
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || "Failed to create anonymous user");
			}

			return response.json();
		},
		onSuccess: () => {
			// After creating anonymous user, join the board
			joinBoardMutation.mutate();
		},
	});

	// Join board as anonymous user
	const joinBoardMutation = useMutation({
		mutationFn: async () => {
			const response = await fetch(`/api/boards/${boardData?.board?.id}/join`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || "Failed to join board");
			}

			return response.json();
		},
		onSuccess: () => {
			if (boardData?.board?.id) {
				router.push(`/boards/${boardData.board.id}`);
			}
		},
	});

	useEffect(() => {
		// If user is logged in and synced, join directly
		if (user && syncedUser && boardData?.board?.id) {
			joinBoardMutation.mutate();
		}
		// If anonymous user exists, join directly
		else if (anonymousData?.user && boardData?.board?.id) {
			joinBoardMutation.mutate();
		}
	}, [user, syncedUser, anonymousData, boardData, joinBoardMutation]);

	const handleJoin = () => {
		if (!user && !anonymousData?.user) {
			createAnonymousUserMutation.mutate(displayName);
		} else {
			joinBoardMutation.mutate();
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

	if (!boardData?.board) {
		return (
			<div className="container mx-auto py-8">
				<div className="flex h-64 items-center justify-center">
					<p className="text-red-500">Board not found</p>
				</div>
			</div>
		);
	}

	// If user is logged in or anonymous user exists, show joining state
	if ((user && syncedUser) || anonymousData?.user) {
		return (
			<div className="container mx-auto py-8">
				<div className="flex h-64 items-center justify-center">
					<p className="text-muted-foreground">Joining board...</p>
				</div>
			</div>
		);
	}

	return (
		<div className="container mx-auto py-8">
			<div className="mx-auto max-w-md">
				<Card>
					<CardHeader>
						<CardTitle>Join Retro Board</CardTitle>
						<CardDescription>
							You&apos;ve been invited to join &quot;{boardData.board.name}
							&quot;
						</CardDescription>
					</CardHeader>
					<CardContent>
						<form
							onSubmit={(e) => {
								e.preventDefault();
								handleJoin();
							}}
							className="space-y-4"
						>
							<div>
								<Label htmlFor="displayName">Your Name</Label>
								<Input
									id="displayName"
									value={displayName}
									onChange={(e) => setDisplayName(e.target.value)}
									placeholder="Enter your name"
									required
								/>
								<p className="mt-1 text-muted-foreground text-sm">
									This is how you&apos;ll appear to other participants
								</p>
							</div>
							<Button
								type="submit"
								className="w-full"
								disabled={
									!displayName.trim() ||
									createAnonymousUserMutation.isPending ||
									joinBoardMutation.isPending
								}
							>
								{createAnonymousUserMutation.isPending ||
								joinBoardMutation.isPending
									? "Joining..."
									: "Join Board"}
							</Button>
						</form>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
