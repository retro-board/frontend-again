"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

type Status = {
	connected: boolean;
	needs_reconnect: boolean;
	webhook: boolean;
	webhook_error: string | null;
};

async function call(method: string, body?: object): Promise<Status> {
	const response = await fetch("/api/tracklines/connection", {
		method,
		headers: body ? { "Content-Type": "application/json" } : undefined,
		body: body ? JSON.stringify(body) : undefined,
	});
	const data = await response.json().catch(() => ({}));
	if (!response.ok) throw new Error(data.error || "Something went wrong");
	return data;
}

export function TracklinesSettings() {
	const queryClient = useQueryClient();
	const keyId = useId();
	const [key, setKey] = useState("");

	const { data: connection, isLoading } = useQuery({
		queryKey: ["tracklines-connection"],
		queryFn: () => call("GET"),
	});
	const save = (status: Status) =>
		queryClient.setQueryData(["tracklines-connection"], status);

	const connect = useMutation({
		mutationFn: () => call("POST", { key }),
		onSuccess: (status) => {
			save(status);
			setKey("");
			toast.success("Connected to TrackLin.es");
		},
		onError: (error) => toast.error(error.message),
	});
	const disconnect = useMutation({
		mutationFn: () => call("DELETE"),
		onSuccess: (status) => {
			save(status);
			toast.success("Disconnected from TrackLin.es");
		},
		onError: (error) => toast.error(error.message),
	});

	return (
		<div className="mx-auto max-w-2xl space-y-6 p-4">
			<h1 className="font-bold text-2xl">Settings</h1>
			<section className="space-y-4 rounded-lg border p-4">
				<div className="flex items-center justify-between">
					<h2 className="font-semibold text-lg">TrackLin.es</h2>
					{connection?.connected && (
						<Badge
							variant={connection.needs_reconnect ? "destructive" : "default"}
						>
							{connection.needs_reconnect ? "Reconnect" : "Connected"}
						</Badge>
					)}
				</div>
				<p className="text-muted-foreground text-sm">
					Pull a board's backlog into sprint poker, and get a retro for every
					sprint. A TrackLin.es admin makes the service key (it starts{" "}
					<code>tl_s_</code>); it's stored encrypted and never shown again.
				</p>

				{connection?.needs_reconnect && (
					<p className="text-destructive text-sm">
						TrackLin.es no longer accepts the key. Paste a new one to reconnect.
					</p>
				)}
				{connection?.connected && !connection.webhook && (
					<p className="text-amber-600 text-sm dark:text-amber-400">
						Retros won't be made automatically when a sprint starts
						{connection.webhook_error ? `: ${connection.webhook_error}` : "."}
					</p>
				)}

				{!isLoading && (
					<form
						className="flex flex-col gap-2 sm:flex-row sm:items-end"
						onSubmit={(e) => {
							e.preventDefault();
							connect.mutate();
						}}
					>
						<div className="grid flex-1 gap-2">
							<Label htmlFor={keyId}>
								{connection?.connected ? "Replace the key" : "Service key"}
							</Label>
							<Input
								id={keyId}
								type="password"
								autoComplete="off"
								placeholder="tl_s_…"
								value={key}
								onChange={(e) => setKey(e.target.value)}
							/>
						</div>
						<Button type="submit" disabled={!key.trim() || connect.isPending}>
							{connect.isPending ? "Checking…" : "Connect"}
						</Button>
						{connection?.connected && (
							<Button
								type="button"
								variant="outline"
								disabled={disconnect.isPending}
								onClick={() => disconnect.mutate()}
							>
								Disconnect
							</Button>
						)}
					</form>
				)}
			</section>
		</div>
	);
}
