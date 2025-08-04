"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pause, Play, SkipForward } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import type { Board, BoardPhase } from "~/types/database";

interface BoardTimerProps {
	board: Board;
	isOwner: boolean;
}

const PHASE_LABELS: Record<BoardPhase, string> = {
	setup: "Setup",
	creation: "Creating Items",
	voting: "Voting",
	discussion: "Discussion",
	completed: "Completed",
};

export function BoardTimer({ board, isOwner }: BoardTimerProps) {
	const queryClient = useQueryClient();
	const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

	// Calculate time remaining
	// biome-ignore lint/correctness/useExhaustiveDependencies: hmm
	useEffect(() => {
		if (!board.phase_ends_at) {
			setTimeRemaining(null);
			return;
		}

		const updateTimer = () => {
			const now = new Date();
			// biome-ignore lint/style/noNonNullAssertion: null1
			const endsAt = new Date(board.phase_ends_at!);
			const remaining = Math.max(
				0,
				Math.floor((endsAt.getTime() - now.getTime()) / 1000),
			);
			setTimeRemaining(remaining);

			// Auto advance to next phase when timer expires
			if (remaining === 0 && isOwner && board.phase !== "completed") {
				advancePhaseMutation.mutate();
			}
		};

		updateTimer();
		const interval = setInterval(updateTimer, 1000);

		return () => clearInterval(interval);
	}, [board.phase_ends_at, board.phase, isOwner]);

	// Start phase mutation
	const startPhaseMutation = useMutation({
		mutationFn: async () => {
			const response = await fetch(`/api/boards/${board.id}/phase`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action: "start" }),
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || "Failed to start phase");
			}

			return response.json();
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["board", board.id] });
		},
	});

	// Pause phase mutation
	const pausePhaseMutation = useMutation({
		mutationFn: async () => {
			const response = await fetch(`/api/boards/${board.id}/phase`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action: "pause" }),
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || "Failed to pause phase");
			}

			return response.json();
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["board", board.id] });
		},
	});

	// Advance phase mutation
	const advancePhaseMutation = useMutation({
		mutationFn: async () => {
			const response = await fetch(`/api/boards/${board.id}/phase`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action: "advance" }),
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || "Failed to advance phase");
			}

			return response.json();
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["board", board.id] });
		},
	});

	const formatTime = (seconds: number) => {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins}:${secs.toString().padStart(2, "0")}`;
	};

	const getPhaseTime = () => {
		if (board.phase === "creation") return board.creation_time_minutes;
		if (board.phase === "voting") return board.voting_time_minutes;
		return 0;
	};

	const isTimerActive =
		board.phase_ends_at && timeRemaining !== null && timeRemaining > 0;

	return (
		<Card>
			<CardHeader className="pb-3">
				<div className="flex items-center justify-between">
					<CardTitle className="text-lg">Board Timer</CardTitle>
					<Badge variant={isTimerActive ? "default" : "secondary"}>
						{PHASE_LABELS[board.phase]}
					</Badge>
				</div>
			</CardHeader>
			<CardContent>
				<div className="space-y-4">
					{timeRemaining !== null && (
						<div className="text-center font-mono text-3xl">
							{formatTime(timeRemaining)}
						</div>
					)}

					{isOwner && board.phase !== "completed" && (
						<div className="flex gap-2">
							{!isTimerActive &&
								board.phase !== "setup" &&
								board.phase !== "discussion" && (
									<Button
										size="sm"
										className="flex-1"
										onClick={() => startPhaseMutation.mutate()}
										disabled={startPhaseMutation.isPending}
									>
										<Play className="mr-1 h-4 w-4" />
										Start {getPhaseTime()} min timer
									</Button>
								)}

							{isTimerActive && (
								<Button
									size="sm"
									variant="secondary"
									className="flex-1"
									onClick={() => pausePhaseMutation.mutate()}
									disabled={pausePhaseMutation.isPending}
								>
									<Pause className="mr-1 h-4 w-4" />
									Pause
								</Button>
							)}

							<Button
								size="sm"
								variant="outline"
								className="flex-1"
								onClick={() => advancePhaseMutation.mutate()}
								disabled={
									advancePhaseMutation.isPending || board.phase === "completed"
								}
							>
								<SkipForward className="mr-1 h-4 w-4" />
								Next Phase
							</Button>
						</div>
					)}

					{board.phase === "creation" && (
						<p className="text-muted-foreground text-sm">
							Add your items to the board. They will remain hidden until the
							creation phase ends.
						</p>
					)}

					{board.phase === "voting" && (
						<p className="text-muted-foreground text-sm">
							Vote on items you find important. You have {board.votes_per_user}{" "}
							votes.
						</p>
					)}

					{board.phase === "discussion" && (
						<p className="text-muted-foreground text-sm">
							Discuss the items and create action items.
						</p>
					)}
				</div>
			</CardContent>
		</Card>
	);
}
