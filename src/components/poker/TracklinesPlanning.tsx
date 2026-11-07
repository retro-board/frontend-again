"use client";

import { useFlags } from "@flags-gg/react-library";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { Button } from "~/components/ui/button";
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
}: {
	sessionId: string;
	facilitator: boolean;
	linked: boolean;
	revision?: string;
}) {
	const enabled = useFlags().is("rb-6").enabled();
	const id = useId();
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
	return (
		<section
			className="mt-6 space-y-3 rounded border p-4"
			aria-label="Plan TrackLin.es tickets"
		>
			<h2 className="font-semibold">
				Plan estimated tickets into future sprints
			</h2>
			{query.error && (
				<div role="alert">
					{query.error.message}{" "}
					<Button variant="outline" onClick={() => void query.refetch()}>
						Retry
					</Button>
				</div>
			)}
			{query.data && !query.data.sprints.length && (
				<p>
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
			{query.data?.stories.map((story) => {
				const counted =
					story.is_estimated &&
					!!story.final_estimate &&
					story.final_estimate !== "?";
				const result = results[story.id];
				return (
					<div key={story.id} className="space-y-1 border-t pt-2">
						<label htmlFor={`${id}-${story.id}`}>
							{story.tracklines_key} — {story.title} (
							{story.final_estimate ?? "Not estimated"})
						</label>
						{counted && !!query.data?.sprints.length && (
							<div className="flex gap-2">
								<select
									id={`${id}-${story.id}`}
									className="rounded border bg-background p-2"
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
						<p role="status">
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
			{mutation.error && <p role="alert">{mutation.error.message}</p>}
			{query.data && (
				<Button
					disabled={mutation.isPending || !Object.values(choices).some(Boolean)}
					onClick={() =>
						mutation.mutate(
							query.data?.stories
								.filter(
									(story) => story.is_estimated && story.final_estimate !== "?",
								)
								.map((story) => story.id) ?? [],
						)
					}
				>
					Plan selected tickets
				</Button>
			)}
		</section>
	);
}
