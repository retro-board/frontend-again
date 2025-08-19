"use client";

import { useUser } from "@clerk/nextjs";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
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

export default function JoinPokerSessionPage() {
	const params = useParams();
	const shareId = params.shareId as string;
	const router = useRouter();
	const { user, isLoaded } = useUser();
	const { syncedUser } = useUserSync();
	const [displayName, setDisplayName] = useState("");

	const elemId = useId();

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

	// Get poker session by share ID
	const { data: sessionData, isLoading } = useQuery({
		queryKey: ["poker-session-share", shareId],
		queryFn: async () => {
			const response = await fetch(`/api/poker-sessions/share/${shareId}`);
			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || "Session not found");
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
			// Trigger join after creating anonymous user
			if (sessionData?.session?.id) {
				joinSessionMutation.mutate();
			}
		},
	});

	// Join session as anonymous user
	const joinSessionMutation = useMutation({
		mutationFn: async () => {
			const response = await fetch(
				`/api/poker-sessions/${sessionData?.session?.id}/join`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
				},
			);

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || "Failed to join session");
			}

			return response.json();
		},
		onSuccess: () => {
			if (sessionData?.session?.id) {
				router.push(`/poker/${sessionData.session.id}`);
			}
		},
	});

	// If user is logged in, join immediately
	useEffect(() => {
		if (
			user &&
			syncedUser &&
			sessionData?.session?.id &&
			!joinSessionMutation.isPending
		) {
			joinSessionMutation.mutate();
		}
	}, [user, syncedUser, sessionData, joinSessionMutation]);

	// If anonymous user exists, redirect to join
	useEffect(() => {
		if (
			anonymousData?.user &&
			sessionData?.session?.id &&
			!joinSessionMutation.isPending
		) {
			joinSessionMutation.mutate();
		}
	}, [anonymousData, sessionData, joinSessionMutation]);

	const handleJoin = () => {
		if (displayName.trim()) {
			createAnonymousUserMutation.mutate(displayName);
		}
	};

	if (isLoading || !isLoaded) {
		return (
			<div className="container mx-auto flex h-screen items-center justify-center">
				<p className="text-muted-foreground">Loading...</p>
			</div>
		);
	}

	if (!sessionData?.session) {
		return (
			<div className="container mx-auto flex h-screen items-center justify-center">
				<Card className="w-full max-w-md">
					<CardHeader>
						<CardTitle>Session Not Found</CardTitle>
						<CardDescription>
							This poker session link is invalid or has expired.
						</CardDescription>
					</CardHeader>
				</Card>
			</div>
		);
	}

	if (!user && !anonymousData?.user) {
		return (
			<div className="container mx-auto flex h-screen items-center justify-center">
				<Card className="w-full max-w-md">
					<CardHeader>
						<CardTitle>Join Poker Session</CardTitle>
						<CardDescription>
							You&apos;ve been invited to &quot;{sessionData.session.name}&quot;
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="name">Your Name</Label>
							<Input
								id={`${elemId}-name`}
								value={displayName}
								onChange={(e) => setDisplayName(e.target.value)}
								placeholder="Enter your name"
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										handleJoin();
									}
								}}
							/>
						</div>
						<div className="flex gap-2">
							<Button
								onClick={handleJoin}
								disabled={
									!displayName.trim() || createAnonymousUserMutation.isPending
								}
								className="flex-1"
							>
								{createAnonymousUserMutation.isPending
									? "Joining..."
									: "Join as Guest"}
							</Button>
							<Button
								variant="outline"
								onClick={() => router.push("/sign-in")}
								className="flex-1"
							>
								Sign In
							</Button>
						</div>
					</CardContent>
				</Card>
			</div>
		);
	}

	// Show loading state while joining
	return (
		<div className="container mx-auto flex h-screen items-center justify-center">
			<p className="text-muted-foreground">Joining session...</p>
		</div>
	);
}
