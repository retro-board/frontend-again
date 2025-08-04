"use client";

import { useUser } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Calendar, Hash, Plus, Users } from "lucide-react";
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
import { RadioGroup, RadioGroupItem } from "~/components/ui/radio-group";
import { Textarea } from "~/components/ui/textarea";
import { useUserSync } from "~/hooks/useUserSync";
import { supabase } from "~/lib/supabase/client";
import type { EstimationType, PokerSession } from "~/types/database";

export default function PokerPage() {
	const router = useRouter();
	const { user, isLoaded } = useUser();
	const { syncedUser } = useUserSync();
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [estimationType, setEstimationType] =
		useState<EstimationType>("fibonacci");

	const { data: sessions, isLoading } = useQuery({
		queryKey: ["poker-sessions", user?.id, syncedUser?.id],
		queryFn: async () => {
			if (!user || !syncedUser) return [];

			// Fetch poker sessions
			const { data, error } = await supabase
				.from("poker_sessions")
				.select(`
          *,
          participants:poker_participants(count)
        `)
				.order("created_at", { ascending: false });

			if (error) throw error;
			return data as (PokerSession & { participants: { count: number }[] })[];
		},
		enabled: !!user && !!syncedUser,
	});

	const createSessionMutation = useMutation({
		mutationFn: async ({
			name,
			description,
			estimation_type,
		}: {
			name: string;
			description?: string;
			estimation_type: EstimationType;
		}) => {
			if (!user) throw new Error("User not authenticated");

			// Use API route to create session (bypasses RLS)
			const response = await fetch("/api/poker-sessions", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ name, description, estimation_type }),
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || "Failed to create session");
			}

			const data = await response.json();
			return data.session;
		},
		onSuccess: (session) => {
			queryClient.invalidateQueries({ queryKey: ["poker-sessions"] });
			setOpen(false);
			setName("");
			setDescription("");
			setEstimationType("fibonacci");
			router.push(`/poker/${session.id}`);
		},
		onError: (error) => {
			console.error("Mutation error:", error);
			toast.error("Failed to create session. Check console for details.");
		},
	});

	const handleCreateSession = () => {
		if (name.trim()) {
			createSessionMutation.mutate({
				name,
				description,
				estimation_type: estimationType,
			});
		}
	};

	const getEstimationTypeLabel = (type: EstimationType) => {
		switch (type) {
			case "fibonacci":
				return "Fibonacci (1, 2, 3, 5, 8...)";
			case "tshirt":
				return "T-Shirt Sizes (XS, S, M, L, XL...)";
			case "oneToTen":
				return "1-10 Scale";
			default:
				return type;
		}
	};

	const getEstimationIcon = (type: EstimationType) => {
		switch (type) {
			case "fibonacci":
				return "🔢";
			case "tshirt":
				return "👕";
			case "oneToTen":
				return "🔟";
			default:
				return "📊";
		}
	};

	if (!isLoaded || isLoading) {
		return (
			<div className="container mx-auto py-8">
				<div className="flex h-64 items-center justify-center">
					<p className="text-muted-foreground">Loading...</p>
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
							Please sign in to view poker sessions
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
				<h1 className="font-bold text-3xl">Sprint Poker Sessions</h1>
				<Dialog open={open} onOpenChange={setOpen}>
					<DialogTrigger asChild>
						<Button>
							<Plus className="mr-2 h-4 w-4" />
							New Session
						</Button>
					</DialogTrigger>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Create Sprint Poker Session</DialogTitle>
							<DialogDescription>
								Start a new estimation session for your team.
							</DialogDescription>
						</DialogHeader>
						<div className="grid gap-4 py-4">
							<div className="grid gap-2">
								<Label htmlFor="name">Session Name</Label>
								<Input
									id="name"
									value={name}
									onChange={(e) => setName(e.target.value)}
									placeholder="Sprint 23 Planning"
								/>
							</div>
							<div className="grid gap-2">
								<Label htmlFor="description">Description (optional)</Label>
								<Textarea
									id="description"
									value={description}
									onChange={(e) => setDescription(e.target.value)}
									placeholder="Planning session for upcoming sprint"
									rows={3}
								/>
							</div>
							<div className="grid gap-2">
								<Label>Estimation Type</Label>
								<RadioGroup
									value={estimationType}
									onValueChange={(value) =>
										setEstimationType(value as EstimationType)
									}
								>
									<div className="flex items-center space-x-2">
										<RadioGroupItem value="fibonacci" id="fibonacci" />
										<Label htmlFor="fibonacci">
											Fibonacci (1, 2, 3, 5, 8, 13, 21...)
										</Label>
									</div>
									<div className="flex items-center space-x-2">
										<RadioGroupItem value="tshirt" id="tshirt" />
										<Label htmlFor="tshirt">
											T-Shirt Sizes (XS, S, M, L, XL, XXL)
										</Label>
									</div>
									<div className="flex items-center space-x-2">
										<RadioGroupItem value="oneToTen" id="oneToTen" />
										<Label htmlFor="oneToTen">1-10 Scale</Label>
									</div>
								</RadioGroup>
							</div>
						</div>
						<DialogFooter>
							<Button variant="outline" onClick={() => setOpen(false)}>
								Cancel
							</Button>
							<Button
								onClick={handleCreateSession}
								disabled={!name.trim() || createSessionMutation.isPending}
							>
								{createSessionMutation.isPending
									? "Creating..."
									: "Create Session"}
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</div>

			{sessions?.length === 0 ? (
				<Card>
					<CardContent className="flex h-64 flex-col items-center justify-center">
						<p className="mb-4 text-muted-foreground">No poker sessions yet</p>
						<Button onClick={() => setOpen(true)}>
							<Plus className="mr-2 h-4 w-4" />
							Create your first session
						</Button>
					</CardContent>
				</Card>
			) : (
				<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
					{sessions?.map((session) => (
						<Card
							key={session.id}
							className="cursor-pointer transition-shadow hover:shadow-lg"
							onClick={() => router.push(`/poker/${session.id}`)}
						>
							<CardHeader>
								<CardTitle className="flex items-center justify-between">
									<span>{session.name}</span>
									<span className="text-2xl">
										{getEstimationIcon(session.estimation_type)}
									</span>
								</CardTitle>
								{session.description && (
									<CardDescription>{session.description}</CardDescription>
								)}
							</CardHeader>
							<CardContent>
								<div className="flex items-center gap-4 text-muted-foreground text-sm">
									<div className="flex items-center gap-1">
										<Hash className="h-4 w-4" />
										<span>
											{getEstimationTypeLabel(session.estimation_type)}
										</span>
									</div>
									<div className="flex items-center gap-1">
										<Users className="h-4 w-4" />
										<span>
											{session.participants?.[0]?.count || 0} participants
										</span>
									</div>
								</div>
								<div className="mt-2 flex items-center gap-1 text-muted-foreground text-sm">
									<Calendar className="h-4 w-4" />
									<span>
										{new Date(session.created_at).toLocaleDateString()}
									</span>
								</div>
							</CardContent>
						</Card>
					))}
				</div>
			)}
		</div>
	);
}
