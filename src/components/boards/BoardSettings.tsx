"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Settings, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "~/components/ui/alert-dialog";
import { Button } from "~/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Slider } from "~/components/ui/slider";
import { Textarea } from "~/components/ui/textarea";
import type { Board } from "~/types/database";

interface BoardSettingsProps {
	board: Board;
	isOwner: boolean;
}

export function BoardSettings({ board, isOwner }: BoardSettingsProps) {
	const router = useRouter();
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

	const [name, setName] = useState(board.name);
	const [description, setDescription] = useState(board.description || "");
	const [creationTime, setCreationTime] = useState(board.creation_time_minutes);
	const [votingTime, setVotingTime] = useState(board.voting_time_minutes);
	const [votesPerUser, setVotesPerUser] = useState(board.votes_per_user);

	// Update board mutation
	const updateBoardMutation = useMutation({
		mutationFn: async () => {
			const response = await fetch(`/api/boards/${board.id}/settings`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name,
					description,
					creation_time_minutes: creationTime,
					voting_time_minutes: votingTime,
					votes_per_user: votesPerUser,
				}),
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || "Failed to update board");
			}

			return response.json();
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["board", board.id] });
			toast.success("Board settings updated");
			setOpen(false);
		},
		onError: (error: Error) => {
			toast.error(error.message);
		},
	});

	// Delete board mutation
	const deleteBoardMutation = useMutation({
		mutationFn: async () => {
			const response = await fetch(`/api/boards/${board.id}/settings`, {
				method: "DELETE",
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || "Failed to delete board");
			}

			return response.json();
		},
		onSuccess: () => {
			toast.success("Board deleted successfully");
			router.push("/boards");
		},
		onError: (error: Error) => {
			toast.error(error.message);
		},
	});

	if (!isOwner) {
		return null;
	}

	return (
		<>
			<Button
				variant="outline"
				size="icon"
				onClick={() => setOpen(true)}
				title="Board settings"
			>
				<Settings className="h-4 w-4" />
			</Button>

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>Board Settings</DialogTitle>
						<DialogDescription>
							Configure your retro board settings
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-4 py-4">
						<div className="space-y-2">
							<Label htmlFor="name">Board Name</Label>
							<Input
								id="name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder="Board name"
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="description">Description (optional)</Label>
							<Textarea
								id="description"
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								placeholder="Board description"
								rows={3}
							/>
						</div>

						<div className="space-y-2">
							<Label>Creation Phase Duration: {creationTime} minutes</Label>
							<Slider
								value={[creationTime]}
								onValueChange={([value]) =>
									setCreationTime(value ?? creationTime)
								}
								min={1}
								max={30}
								step={1}
								className="w-full"
							/>
						</div>

						<div className="space-y-2">
							<Label>Voting Phase Duration: {votingTime} minutes</Label>
							<Slider
								value={[votingTime]}
								onValueChange={([value]) => setVotingTime(value ?? votingTime)}
								min={1}
								max={30}
								step={1}
								className="w-full"
							/>
						</div>

						<div className="space-y-2">
							<Label>Votes Per User: {votesPerUser}</Label>
							<Slider
								value={[votesPerUser]}
								onValueChange={([value]) =>
									setVotesPerUser(value ?? votesPerUser)
								}
								min={1}
								max={10}
								step={1}
								className="w-full"
							/>
						</div>
					</div>

					<DialogFooter className="flex-col gap-2 sm:flex-row">
						<AlertDialog
							open={deleteDialogOpen}
							onOpenChange={setDeleteDialogOpen}
						>
							<AlertDialogTrigger asChild>
								<Button variant="destructive" className="w-full sm:w-auto">
									<Trash2 className="mr-2 h-4 w-4" />
									Delete Board
								</Button>
							</AlertDialogTrigger>
							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
									<AlertDialogDescription>
										This action cannot be undone. This will permanently delete
										your board and remove all associated data.
									</AlertDialogDescription>
								</AlertDialogHeader>
								<AlertDialogFooter>
									<AlertDialogCancel>Cancel</AlertDialogCancel>
									<AlertDialogAction
										onClick={() => deleteBoardMutation.mutate()}
										className="bg-red-600 hover:bg-red-700"
									>
										Delete Board
									</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>

						<div className="flex w-full gap-2 sm:w-auto">
							<Button
								variant="outline"
								onClick={() => {
									setName(board.name);
									setDescription(board.description || "");
									setCreationTime(board.creation_time_minutes);
									setVotingTime(board.voting_time_minutes);
									setVotesPerUser(board.votes_per_user);
									setOpen(false);
								}}
							>
								Cancel
							</Button>
							<Button
								onClick={() => updateBoardMutation.mutate()}
								disabled={!name.trim() || updateBoardMutation.isPending}
							>
								{updateBoardMutation.isPending ? "Saving..." : "Save Changes"}
							</Button>
						</div>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
