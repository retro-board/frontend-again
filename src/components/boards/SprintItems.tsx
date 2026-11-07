"use client";

import { useFlags } from "@flags-gg/react-library";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ListTodo, RefreshCw } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "~/components/ui/sheet";
import type { SprintItem } from "~/lib/tracklines/retros";
import { cn } from "~/lib/utils";

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

// The drag payload: a sprint ticket's id, dropped onto your own card to link it
export const SPRINT_ITEM_MIME = "application/x-sprint-item";

export function SprintItems({
	boardId,
	linkable = false,
}: {
	boardId: string;
	// while cards are being written, tickets can be dragged onto your cards
	linkable?: boolean;
}) {
	const { enabled, data, error, refetch, isFetching } = useSprintItems(boardId);
	if (!enabled || (!data?.linked && !error)) return null;
	return (
		// not modal, so the board stays usable (and droppable) beside the drawer
		<Sheet modal={false}>
			<div>
				<SheetTrigger asChild>
					<Button variant="outline" className="w-full justify-between">
						<span className="flex items-center gap-2">
							<ListTodo className="size-4" />
							Sprint tickets{" "}
							<span className="text-muted-foreground">
								({data?.items.length ?? 0})
							</span>
						</span>
						<ChevronLeft className="size-4" />
					</Button>
				</SheetTrigger>
			</div>
			<SheetContent side="right" className="w-full gap-0 sm:max-w-md">
				<SheetHeader className="shrink-0 pr-12">
					<div className="flex flex-wrap items-center gap-3">
						<SheetTitle>Sprint tickets</SheetTitle>
						<Button
							variant="outline"
							size="sm"
							disabled={isFetching}
							onClick={() => void refetch()}
						>
							<RefreshCw className="mr-2 size-4" />
							Refresh tickets
						</Button>
					</div>
					<SheetDescription>
						{linkable
							? "Drag a ticket onto one of your cards to link it."
							: "Review this sprint's tickets and link them to your retro cards."}
					</SheetDescription>
				</SheetHeader>
				<div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-6">
					{(data?.stale || error) && (
						<p role="status">
							{data?.note ?? "Could not load sprint items. Try refreshing."}
						</p>
					)}
					<ul className="divide-y">
						{data?.items.map((item) => (
							<li
								key={item.id}
								className={cn(
									"flex flex-wrap items-baseline gap-x-2 gap-y-1 py-3",
									linkable && "cursor-grab active:cursor-grabbing",
								)}
								draggable={linkable}
								onDragStart={(event) => {
									event.dataTransfer.setData(SPRINT_ITEM_MIME, item.id);
									event.dataTransfer.effectAllowed = "link";
								}}
							>
								<a
									className="font-medium underline"
									href={item.url}
									target="_blank"
									rel="noreferrer"
								>
									{item.key}
								</a>
								<span className="wrap-anywhere min-w-0 flex-1">
									{item.title}
								</span>
								<span className="text-muted-foreground text-sm">
									({item.estimate ?? "Unestimated"})
								</span>
							</li>
						))}
					</ul>
					{data?.items.length === 0 && <p>No tickets in this sprint yet.</p>}
				</div>
				<SheetFooter className="shrink-0 border-t">
					<SheetClose asChild>
						<Button variant="outline">Close</Button>
					</SheetClose>
				</SheetFooter>
			</SheetContent>
		</Sheet>
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
