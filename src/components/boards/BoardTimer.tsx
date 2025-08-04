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
			if (
				remaining === 0 &&
				isOwner &&
				board.phase !== ("completed" as BoardPhase)
			) {
				advancePhaseMutation.mutate();
			}
		};

		updateTimer();
		const interval = setInterval(updateTimer, 1000);

		return () => clearInterval(interval);
	}, [board.phase_ends_at, isOwner]);

	// Phase advance mutation
	const advancePhaseMutation = useMutation({
		mutationFn: async () => {
			const response = await fetch(`/api/boards/${board.id}/phase`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
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

	// Pause/Resume mutation
	const pauseResumeMutation = useMutation({
		mutationFn: async () => {
			const response = await fetch(`/api/boards/${board.id}/phase`, {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
				},
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || "Failed to pause/resume timer");
			}

			return response.json();
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["board", board.id] });
		},
	});

	const formatTime = (seconds: number | null) => {
		if (seconds === null) return "--:--";
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins.toString().padStart(2, "0")}:${secs
			.toString()
			.padStart(2, "0")}`;
	};

	// Get phase duration based on current phase
	const getPhaseDuration = () => {
		switch (board.phase) {
			case "creation":
				return board.creation_time_minutes;
			case "voting":
				return board.voting_time_minutes;
			default:
				return null;
		}
	};

	const phaseDuration = getPhaseDuration();

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center justify-between">
					<span>Board Timer</span>
					<Badge variant="secondary">{PHASE_LABELS[board.phase]}</Badge>
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				{board.phase_ends_at && (
					<div className="text-center">
						<div className="font-bold font-mono text-4xl">
							{formatTime(timeRemaining)}
						</div>
						{phaseDuration && timeRemaining !== null && (
							<div className="mt-2">
								<div className="h-2 w-full rounded-full bg-gray-200">
									<div
										className="h-2 rounded-full bg-primary transition-all"
										style={{
											width: `${Math.max(
												0,
												100 - (timeRemaining / (phaseDuration * 60)) * 100,
											)}%`,
										}}
									/>
								</div>
							</div>
						)}
					</div>
				)}

				{isOwner && board.phase !== ("completed" as BoardPhase) && (
					<div className="flex gap-2">
						{board.phase_ends_at && (
							<Button
								size="sm"
								variant="outline"
								className="flex-1"
								onClick={() => pauseResumeMutation.mutate()}
								disabled={pauseResumeMutation.isPending}
							>
								{timeRemaining !== null ? (
									<>
										<Pause className="mr-1 h-4 w-4" />
										Pause
									</>
								) : (
									<>
										<Play className="mr-1 h-4 w-4" />
										Resume
									</>
								)}
							</Button>
						)}
						{board.phase !== "setup" && (
							<Button
								size="sm"
								variant="outline"
								className="flex-1"
								onClick={() => advancePhaseMutation.mutate()}
								disabled={
									advancePhaseMutation.isPending ||
									board.phase === ("completed" as BoardPhase)
								}
							>
								<SkipForward className="mr-1 h-4 w-4" />
								Next Phase
							</Button>
						)}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
