"use client";

import { useFlags } from "@flags-gg/react-library";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, ChevronLeft } from "lucide-react";
import { useState } from "react";
import { usePaged } from "~/components/Pager";
import { Badge } from "~/components/ui/badge";
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
import type { PlannedSprint } from "~/lib/tracklines/client";
import type { PlanningOutcome } from "~/lib/tracklines/poker";
import { tracklinesRequest } from "./TracklinesSetup";

type PlanningStory = {
	id: string;
	title: string;
	tracklines_key: string;
	final_estimate: string | null;
	is_estimated: boolean;
	tracklines_planned_sprint_id: string | null;
	tracklines_planning_error: string | null;
};
export function TracklinesPlanning({
	sessionId,
	facilitator,
	linked,
	revision,
	currentStoryId,
	onSelect,
}: {
	sessionId: string;
	facilitator: boolean;
	linked: boolean;
	revision?: string;
	currentStoryId?: string;
	// picking a ticket here makes it the current story and closes the drawer
	onSelect?: (story: { id: string; title: string }) => void;
}) {
	const enabled = useFlags().is("rb-6").enabled();
	const client = useQueryClient();
	const [choices, setChoices] = useState<Record<string, string>>({});
	const [results, setResults] = useState<Record<string, PlanningOutcome>>({});
	const path = `/api/poker-sessions/${sessionId}/tracklines`;
	const query = useQuery<{
		sprints: PlannedSprint[];
		stories: PlanningStory[];
		boardUrl: string;
	}>({
		queryKey: ["tracklines-planning", sessionId, revision],
		enabled: enabled && linked && facilitator,
		retry: false,
		queryFn: () => tracklinesRequest(path),
	});
	// estimated tickets first: they're the ones that can be planned (sort is stable)
	const storyList = usePaged(
		[...(query.data?.stories ?? [])].sort(
			(a, b) => Number(plannable(b)) - Number(plannable(a)),
		),
	);
	const mutation = useMutation({
		mutationFn: async (storyIds: string[]) =>
			tracklinesRequest(path, {
				plans: storyIds
					.filter((story) => choices[story])
					.map((story) => ({
						story_id: story,
						planned_sprint_id: choices[story],
					})),
			}) as Promise<{ results: PlanningOutcome[] }>,
		onSuccess: (data) => {
			setResults((previous) => ({
				...previous,
				...Object.fromEntries(
					data.results.map((result) => [result.story_id, result]),
				),
			}));
			void query.refetch();
			void client.invalidateQueries({ queryKey: ["poker-session", sessionId] });
		},
	});
	if (!enabled || !linked || !facilitator) return null;
	const stories = query.data?.stories ?? [];
	const estimated = stories.filter(
		(story) => story.is_estimated && story.final_estimate !== "?",
	).length;
	return (
		<Sheet>
			<SheetTrigger asChild>
				<Button variant="outline" className="mb-4 w-full justify-between">
					<span className="flex items-center gap-2">
						<CalendarPlus className="size-4" />
						Plan in TrackLin.es
						<span className="text-muted-foreground">
							({estimated}/{stories.length} estimated)
						</span>
					</span>
					<ChevronLeft className="size-4" />
				</Button>
			</SheetTrigger>
			<SheetContent side="right" className="w-full gap-0 sm:max-w-md">
				<SheetHeader className="shrink-0 pr-12">
					<SheetTitle>Plan estimated tickets into future sprints</SheetTitle>
					<SheetDescription>
						Estimated tickets can go into a planned sprint; the rest stay in the
						backlog.
					</SheetDescription>
				</SheetHeader>
				<section
					className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-4"
					aria-label="Plan TrackLin.es tickets"
				>
					{query.error && (
						<div role="alert">
							{query.error.message}{" "}
							<Button variant="outline" onClick={() => void query.refetch()}>
								Retry
							</Button>
						</div>
					)}
					{storyList.items.map((story) => {
						const counted = plannable(story);
						const result = results[story.id];
						return (
							<div key={story.id} className="space-y-2 rounded-lg border p-3">
								<div className="flex items-start justify-between gap-3">
									<SheetClose asChild>
										<button
											type="button"
											className={`min-w-0 flex-1 space-y-0.5 rounded text-left hover:underline ${
												story.id === currentStoryId ? "text-primary" : ""
											}`}
											aria-current={story.id === currentStoryId || undefined}
											onClick={() => onSelect?.(story)}
										>
											<span className="block font-mono text-muted-foreground text-xs">
												{story.tracklines_key}
											</span>
											<span className="wrap-anywhere block font-medium text-sm">
												{story.title}
											</span>
										</button>
									</SheetClose>
									<Badge
										variant={counted ? "default" : "secondary"}
										className="shrink-0"
									>
										{story.final_estimate ?? "Not estimated"}
									</Badge>
								</div>
								{counted && !!query.data?.sprints.length && (
									<div className="flex gap-2">
										<select
											aria-label={`Sprint for ${story.tracklines_key}`}
											className="min-w-0 flex-1 rounded border bg-background p-2 text-sm"
											value={choices[story.id] ?? ""}
											onChange={(event) =>
												setChoices((previous) => ({
													...previous,
													[story.id]: event.target.value,
												}))
											}
										>
											<option value="">Leave in backlog</option>
											{query.data.sprints.map((sprint) => (
												<option key={sprint.id} value={sprint.id}>
													Sprint {sprint.number}
													{sprint.goal ? ` — ${sprint.goal}` : ""}
												</option>
											))}
										</select>
										<Button
											disabled={!choices[story.id] || mutation.isPending}
											onClick={() => mutation.mutate([story.id])}
										>
											{result?.status === "failed" ||
											story.tracklines_planning_error
												? "Retry planning"
												: "Plan ticket"}
										</Button>
									</div>
								)}
								<p role="status" className="text-muted-foreground text-xs">
									{!counted
										? "Skipped — remains in backlog"
										: (result?.error ??
											story.tracklines_planning_error ??
											(result?.status === "planned" ||
											story.tracklines_planned_sprint_id
												? "Planned successfully"
												: "Awaiting sprint selection"))}
								</p>
							</div>
						);
					})}
					{storyList.pager}
					{mutation.error && <p role="alert">{mutation.error.message}</p>}
				</section>
				<SheetFooter className="shrink-0 border-t">
					{query.data && !query.data.sprints.length && (
						<p className="text-sm">
							No planned sprints yet.{" "}
							<a
								href={query.data.boardUrl}
								className="underline"
								target="_blank"
								rel="noreferrer"
							>
								Plan a future sprint in TrackLin.es
							</a>
							.
						</p>
					)}
					<div className="flex justify-between gap-2">
						{query.data && (
							<Button
								disabled={
									mutation.isPending || !Object.values(choices).some(Boolean)
								}
								onClick={() =>
									mutation.mutate(
										query.data?.stories
											.filter(
												(story) =>
													story.is_estimated && story.final_estimate !== "?",
											)
											.map((story) => story.id) ?? [],
									)
								}
							>
								Plan selected tickets
							</Button>
						)}
						<SheetClose asChild>
							<Button variant="outline">Close</Button>
						</SheetClose>
					</div>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}

// plannable: it has a real estimate, so it can go into a planned sprint
function plannable(story: {
	is_estimated: boolean;
	final_estimate: string | null;
}) {
	return (
		story.is_estimated && !!story.final_estimate && story.final_estimate !== "?"
	);
}
