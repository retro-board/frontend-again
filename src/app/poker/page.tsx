"use client";

import { useUser } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Calendar, Hash, Plus, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import {
	TracklinesSetup,
	tracklinesRequest,
} from "~/components/poker/TracklinesSetup";
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
import {
	RESULT_METHOD_LABELS,
	RESULT_METHODS,
	type ResultMethod,
} from "~/lib/poker/score";
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
	const [tracklinesSource, setTracklinesSource] = useState<{
		project_id: string;
		board_id: string;
	} | null>(null);
	const [resultMethod, setResultMethod] = useState<ResultMethod>("average");

	const elemId = useId();
	const changeOpen = (value: boolean) => {
		setOpen(value);
		setTracklinesSource(null);
	};

	const { data: sessions, isLoading } = useQuery({
		queryKey: ["poker-sessions", user?.id],
		queryFn: async () => {
			if (!user) return [];

			// Fetch poker sessions via API to bypass RLS
			const response = await fetch("/api/poker-sessions");

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || "Failed to fetch sessions");
			}

			const data = await response.json();
			return data.sessions as (PokerSession & {
				participants: { count: number }[];
			})[];
		},
		enabled: !!user,
	});

	const createSessionMutation = useMutation({
		mutationFn: async ({
			name,
			description,
			estimation_type,
			result_method,
		}: {
			name: string;
			description?: string;
			estimation_type: EstimationType;
			result_method: ResultMethod;
		}) => {
			if (!user) throw new Error("User not authenticated");

			if (tracklinesSource)
				return (
					await tracklinesRequest("/api/tracklines/poker", {
						name,
						description,
						result_method,
						...tracklinesSource,
					})
				).session;

			// Use API route to create session (bypasses RLS)
			const response = await fetch("/api/poker-sessions", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					name,
					description,
					estimation_type,
					result_method,
				}),
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
			changeOpen(false);
			setName("");
			setDescription("");
			setEstimationType("fibonacci");
			setResultMethod("average");
			setTracklinesSource(null);
			router.push(`/poker/${session.id}`);
		},
		onError: (error) => {
			console.error("Mutation error:", error);
			toast.error(error.message);
		},
	});

	const handleCreateSession = () => {
		if (name.trim()) {
			createSessionMutation.mutate({
				name,
				description,
				estimation_type: estimationType,
				result_method: resultMethod,
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

	if (!isLoaded || isLoading || (user && !syncedUser)) {
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
				<Dialog open={open} onOpenChange={changeOpen}>
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
							<TracklinesSetup onChange={setTracklinesSource} />
							<div className="grid gap-2">
								<Label htmlFor="name">Session Name</Label>
								<Input
									id={`${elemId}-name`}
									value={name}
									onChange={(e) => setName(e.target.value)}
									placeholder="Sprint 23 Planning"
								/>
							</div>
							<div className="grid gap-2">
								<Label htmlFor="description">Description (optional)</Label>
								<Textarea
									id={`${elemId}-description`}
									value={description}
									onChange={(e) => setDescription(e.target.value)}
									placeholder="Planning session for upcoming sprint"
									rows={3}
								/>
							</div>
							<div className={tracklinesSource ? "hidden" : "grid gap-2"}>
								<Label>Estimation Type</Label>
								<RadioGroup
									disabled={!!tracklinesSource}
									value={estimationType}
									onValueChange={(value) =>
										setEstimationType(value as EstimationType)
									}
								>
									<div className="flex items-center space-x-2">
										<RadioGroupItem
											value="fibonacci"
											id={`${elemId}-fibonacci`}
										/>
										<Label htmlFor="fibonacci">
											Fibonacci (1, 2, 3, 5, 8, 13, 21...)
										</Label>
									</div>
									<div className="flex items-center space-x-2">
										<RadioGroupItem value="tshirt" id={`${elemId}-tshirt`} />
										<Label htmlFor="tshirt">
											T-Shirt Sizes (XS, S, M, L, XL, XXL)
										</Label>
									</div>
									<div className="flex items-center space-x-2">
										<RadioGroupItem
											value="oneToTen"
											id={`${elemId}-oneToTen`}
										/>
										<Label htmlFor="oneToTen">1-10 Scale</Label>
									</div>
								</RadioGroup>
							</div>
							<div className="grid gap-2">
								<Label>How the result is worked out</Label>
								<RadioGroup
									value={resultMethod}
									onValueChange={(value) =>
										setResultMethod(value as ResultMethod)
									}
								>
									{RESULT_METHODS.map((method) => (
										<div key={method} className="flex items-center space-x-2">
											<RadioGroupItem
												value={method}
												id={`${elemId}-${method}`}
											/>
											<Label htmlFor={`${elemId}-${method}`}>
												{RESULT_METHOD_LABELS[method]}
											</Label>
										</div>
									))}
								</RadioGroup>
							</div>
						</div>
						<DialogFooter>
							<Button variant="outline" onClick={() => changeOpen(false)}>
								Cancel
							</Button>
							<Button
								onClick={handleCreateSession}
								disabled={
									!name.trim() ||
									createSessionMutation.isPending ||
									(!!tracklinesSource &&
										(!tracklinesSource.project_id ||
											!tracklinesSource.board_id))
								}
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
						<Button onClick={() => changeOpen(true)}>
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
