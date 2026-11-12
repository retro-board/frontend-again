"use client";
import { useFlags } from "@flags-gg/react-library";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "~/components/ui/button";

type Action = {
	id: string;
	content: string;
	ticketKey: string | null;
	url: string | null;
	error: string | null;
	waitingForReveal: boolean;
};
export function TracklinesActions({
	boardId,
	isOwner,
}: {
	boardId: string;
	isOwner: boolean;
}) {
	const flags = useFlags();
	const enabled = flags.is("rb-27").enabled() && flags.is("rb-5").enabled();
	const client = useQueryClient();
	const queryKey = ["board", boardId, "tracklines-actions"];
	const request = async (method: string) => {
		const response = await fetch(`/api/boards/${boardId}/actions`, { method });
		const data = await response.json();
		if (!response.ok)
			throw new Error(data.error ?? "Could not load action items");
		return data as { linked: boolean; completed: boolean; actions: Action[] };
	};
	const query = useQuery({
		queryKey,
		enabled,
		retry: false,
		queryFn: () => request("GET"),
	});
	const send = useMutation({
		mutationFn: () => request("POST"),
		onSuccess: (data) => client.setQueryData(queryKey, data),
	});
	if (!enabled || (!query.data?.linked && !query.error)) return null;
	const pending = query.data?.actions.some(
		(action) => !action.ticketKey && !action.waitingForReveal,
	);
	return (
		<section className="space-y-2" aria-label="TrackLin.es action items">
			<h3 className="font-medium">Action items in TrackLin.es</h3>
			<p className="text-muted-foreground text-sm">
				Action items are sent to the linked board’s project backlog when the
				retro is completed.
			</p>
			{(query.error || send.error) && (
				<p role="alert" className="text-sm">
					{(send.error ?? query.error)?.message}
				</p>
			)}
			<ul className="space-y-2 text-sm">
				{query.data?.actions.map((action) => (
					<li key={action.id} className="space-y-1">
						<p className="wrap-anywhere">
							{action.waitingForReveal
								? "Available after reveal"
								: action.content}
						</p>
						{action.url && action.ticketKey ? (
							<a
								className="underline"
								href={action.url}
								target="_blank"
								rel="noreferrer"
							>
								{action.ticketKey}
							</a>
						) : (
							<p role="status" className="text-muted-foreground">
								{action.error ??
									(!query.data?.completed
										? "Waiting for retro completion"
										: action.waitingForReveal
											? "Waiting for reveal"
											: "Not sent yet")}
							</p>
						)}
					</li>
				))}
			</ul>
			{isOwner && query.data?.completed && pending && (
				<Button
					size="sm"
					variant="outline"
					disabled={send.isPending}
					onClick={() => send.mutate()}
				>
					{send.isPending ? "Sending…" : "Send pending action items"}
				</Button>
			)}
			{query.error && (
				<Button
					size="sm"
					variant="outline"
					onClick={() => void query.refetch()}
				>
					Refresh action items
				</Button>
			)}
		</section>
	);
}
