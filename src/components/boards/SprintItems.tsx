"use client";

import { useFlags } from "@flags-gg/react-library";
import { useQuery } from "@tanstack/react-query";
import { Button } from "~/components/ui/button";
import type { SprintItem } from "~/lib/tracklines/retros";

export function useSprintItems(boardId: string) {
	const enabled = useFlags().is("rb-5").enabled();
	const query = useQuery<{
		items: SprintItem[];
		linked: boolean;
		stale: boolean;
		note?: string;
	}>({
		queryKey: ["sprint-items", boardId],
		enabled,
		staleTime: 30000,
		retry: false,
		queryFn: async () => {
			const response = await fetch(`/api/boards/${boardId}/items`);
			if (!response.ok) throw new Error("Could not load sprint items");
			return response.json();
		},
	});
	return { ...query, enabled };
}

export function SprintItems({ boardId }: { boardId: string }) {
	const { enabled, data, error, refetch, isFetching } = useSprintItems(boardId);
	if (!enabled || (!data?.linked && !error)) return null;
	return (
		<section
			className="container mx-auto space-y-2 p-4"
			aria-label="TrackLin.es sprint items"
		>
			<div className="flex items-center gap-3">
				<h2 className="font-semibold">Sprint items</h2>
				<Button
					variant="outline"
					size="sm"
					disabled={isFetching}
					onClick={() => void refetch()}
				>
					Refresh tickets
				</Button>
			</div>
			{(data?.stale || error) && (
				<p role="status">
					{data?.note ?? "Could not load sprint items. Try refreshing."}
				</p>
			)}
			<ul className="space-y-1">
				{data?.items.map((item) => (
					<li key={item.id}>
						<a
							className="underline"
							href={item.url}
							target="_blank"
							rel="noreferrer"
						>
							{item.key}
						</a>{" "}
						— {item.title}{" "}
						<span className="text-muted-foreground">
							({item.estimate ?? "Unestimated"})
						</span>
					</li>
				))}
			</ul>
			{data?.items.length === 0 && <p>No tickets in this sprint yet.</p>}
		</section>
	);
}

export function SprintItemPicker({
	boardId,
	selected,
	onChange,
}: {
	boardId: string;
	selected: string[];
	onChange: (ids: string[]) => void;
}) {
	const { enabled, data, error } = useSprintItems(boardId);
	if (!enabled || !data?.linked) return null;
	return (
		<fieldset
			className="space-y-1"
			onPointerDown={(event) => event.stopPropagation()}
			onClick={(event) => event.stopPropagation()}
			onKeyDown={(event) => event.stopPropagation()}
		>
			<legend className="text-sm">Link sprint tickets</legend>
			{selected.length > 0 && (
				<button
					type="button"
					className="text-sm underline"
					onClick={() => onChange([])}
				>
					Clear ticket links
				</button>
			)}
			{error && <p role="status">Could not load sprint tickets</p>}
			{data.items.map((item) => (
				<label key={item.id} className="flex items-start gap-2 text-sm">
					<input
						type="checkbox"
						checked={selected.includes(item.id)}
						onChange={(event) =>
							onChange(
								event.target.checked
									? [...selected, item.id]
									: selected.filter((id) => id !== item.id),
							)
						}
					/>
					{item.key} — {item.title}
				</label>
			))}
		</fieldset>
	);
}
