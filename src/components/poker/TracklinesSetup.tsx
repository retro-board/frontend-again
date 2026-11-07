"use client";

import { useFlags } from "@flags-gg/react-library";
import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import type { Board, Project } from "~/lib/tracklines/client";

export async function tracklinesRequest(path: string, body?: unknown) {
	const response = await fetch(
		path,
		body === undefined
			? undefined
			: {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(body),
				},
	);
	const data = await response.json();
	if (!response.ok) throw new Error(data.error || "TrackLin.es request failed");
	return data;
}

export function TracklinesSetup({
	onChange,
}: {
	onChange: (
		selection: { project_id: string; board_id: string } | null,
	) => void;
}) {
	const enabled = useFlags().is("rb-6").enabled();
	const id = useId();
	const [source, setSource] = useState("normal");
	const [project, setProject] = useState("");
	const [board, setBoard] = useState("");
	const connection = useQuery<{ connected: boolean; projects?: Project[] }>({
		queryKey: ["tracklines-poker-projects"],
		enabled,
		retry: false,
		queryFn: () => tracklinesRequest("/api/tracklines/poker"),
	});
	const boards = useQuery<{ boards: Board[] }>({
		queryKey: ["tracklines-poker-boards", project],
		enabled: enabled && source === "tracklines" && !!project,
		retry: false,
		queryFn: () =>
			tracklinesRequest(
				`/api/tracklines/poker?project_id=${encodeURIComponent(project)}`,
			),
	});
	const backlog = useQuery<{
		tickets: { id: string }[];
		session_name?: string;
		scale: { values: string[] };
	}>({
		queryKey: ["tracklines-poker-backlog", project, board],
		enabled: enabled && source === "tracklines" && !!project && !!board,
		retry: false,
		queryFn: () =>
			tracklinesRequest(
				`/api/tracklines/poker?project_id=${encodeURIComponent(project)}&board_id=${encodeURIComponent(board)}`,
			),
	});
	if (!enabled || !connection.data?.connected) return null;
	return (
		<fieldset className="space-y-3">
			<legend className="font-medium">Session source</legend>
			<label className="block text-sm" htmlFor={`${id}-source`}>
				Normal or TrackLin.es
			</label>
			<select
				id={`${id}-source`}
				className="w-full rounded border bg-background p-2"
				value={source}
				onChange={(event) => {
					setSource(event.target.value);
					setProject("");
					setBoard("");
					onChange(
						event.target.value === "tracklines"
							? { project_id: "", board_id: "" }
							: null,
					);
				}}
			>
				<option value="normal">Normal</option>
				<option value="tracklines">TrackLin.es</option>
			</select>
			{source === "tracklines" && (
				<>
					<label className="block text-sm" htmlFor={`${id}-project`}>
						TrackLin.es project
					</label>
					<select
						id={`${id}-project`}
						className="w-full rounded border bg-background p-2"
						value={project}
						onChange={(event) => {
							setProject(event.target.value);
							setBoard("");
							onChange({ project_id: event.target.value, board_id: "" });
						}}
					>
						<option value="">Choose a project</option>
						{connection.data.projects?.map((project) => (
							<option key={project.id} value={project.id}>
								{project.name}
							</option>
						))}
					</select>
					<label className="block text-sm" htmlFor={`${id}-board`}>
						TrackLin.es board
					</label>
					<select
						id={`${id}-board`}
						className="w-full rounded border bg-background p-2"
						value={board}
						disabled={!project}
						onChange={(event) => {
							setBoard(event.target.value);
							onChange(
								event.target.value
									? { project_id: project, board_id: event.target.value }
									: { project_id: project, board_id: "" },
							);
						}}
					>
						<option value="">Choose a board</option>
						{boards.data?.boards.map((board) => (
							<option
								key={board.id}
								value={board.id}
								disabled={
									!board.estimate_scale || board.estimate_scale === "none"
								}
							>
								{board.name} ({board.estimate_scale ?? "no estimates"})
							</option>
						))}
					</select>
					{backlog.data?.session_name && (
						<p role="status">
							Session name: <strong>{backlog.data.session_name}</strong>
						</p>
					)}
					{backlog.data && (
						<p>
							{backlog.data.tickets.length} backlog tickets · Cards:{" "}
							{backlog.data.scale.values.join(", ")}
						</p>
					)}
					{(boards.error || backlog.error) && (
						<p role="alert" className="text-destructive">
							{(boards.error ?? backlog.error)?.message}
						</p>
					)}
				</>
			)}
		</fieldset>
	);
}
