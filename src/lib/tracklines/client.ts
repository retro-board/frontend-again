// A small TrackLin.es API client (RB-3), used by poker (RB-6) and sprint retros (RB-5). It acts with a
// service key (tl_s_…), as the TrackLin.es admin who made it. Nothing here moves a ticket into the
// current sprint: planning only targets planned (future) sprints.

export class TracklinesError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
		this.name = "TracklinesError";
	}
}

export interface Project {
	id: string;
	name: string;
	key_prefix: string;
}
export interface Board {
	id: string;
	project_id: string;
	name: string;
	estimate_scale?: string;
	style?: "sprints" | "kanban";
}
export interface Ticket {
	id: string;
	key: string;
	title: string;
	type: string;
	priority: string;
	estimate: string | null;
	description?: string;
	sprint_id?: string | null;
}
export interface Attachment {
	id: string;
	name: string;
	url: string;
	content_type: string;
	size: number;
}
export interface Sprint {
	id: string;
	board_id: string;
	number: number;
	starts_at: string;
	ends_at: string;
	goal?: string;
}
export interface PlannedSprint {
	id: string;
	board_id: string;
	number: number;
	goal?: string;
	tickets: Ticket[];
}
interface BoardDetail extends Board {
	sprint?: Sprint;
	columns: { tickets?: Ticket[] }[];
}

const BASE = () =>
	(process.env.TRACKLINES_API_URL || "https://api.tracklin.es/api").replace(
		/\/$/,
		"",
	);

export function tracklines(key: string) {
	async function call<T>(method: string, path: string, body?: unknown) {
		const response = await fetch(`${BASE()}${path}`, {
			method,
			headers: {
				Authorization: `Bearer ${key}`,
				...(body === undefined ? {} : { "Content-Type": "application/json" }),
			},
			body: body === undefined ? undefined : JSON.stringify(body),
			redirect: "error", // never send the key on to somewhere else
			signal: AbortSignal.timeout(10_000),
		});
		const text = await response.text();
		if (!response.ok) {
			// TrackLin.es's own message, as it comes (plain text or {"error": "…"})
			let message = text.trim();
			try {
				const parsed = JSON.parse(text);
				if (typeof parsed?.error === "string") message = parsed.error;
			} catch {
				// plain text
			}
			throw new TracklinesError(
				message || `TrackLin.es answered ${response.status}`,
				response.status,
			);
		}
		return (text ? JSON.parse(text) : undefined) as T;
	}
	const id = encodeURIComponent;

	return {
		projects: () => call<Project[]>("GET", "/projects"),
		boards: (projectId: string) =>
			call<Board[]>("GET", `/projects/${id(projectId)}/boards`),
		backlog: (projectId: string) =>
			call<Ticket[]>("GET", `/projects/${id(projectId)}/backlog`),
		ticket: (ticketId: string) =>
			call<Ticket>("GET", `/tickets/${id(ticketId)}`),
		attachments: (ticketId: string) =>
			call<Attachment[]>("GET", `/tickets/${id(ticketId)}/attachments`),
		plannedSprints: (boardId: string) =>
			call<PlannedSprint[]>("GET", `/boards/${id(boardId)}/planned-sprints`),
		// openSprint: the board's open sprint and its tickets (read only, for retros); null with none open
		openSprint: async (boardId: string) => {
			const board = await call<BoardDetail>("GET", `/boards/${id(boardId)}`);
			if (!board.sprint) return null;
			const sprintId = board.sprint.id;
			const tickets = board.columns
				.flatMap((c) => c.tickets ?? [])
				.filter((t) => t.sprint_id === sprintId);
			return { sprint: board.sprint, tickets };
		},
		// planTicket puts a backlog ticket into a planned sprint, sized on that board's scale
		planTicket: (ticketId: string, plannedSprintId: string, estimate: string) =>
			call<void>("PUT", `/tickets/${id(ticketId)}/planned-sprint`, {
				planned_sprint_id: plannedSprintId,
				estimate,
			}),
		createWebhook: (url: string) =>
			call<{ endpoint: { id: string }; secret: string }>(
				"POST",
				"/org/webhooks",
				{ url, events: ["sprint.started"] },
			),
		deleteWebhook: (webhookId: string) =>
			call<void>("DELETE", `/org/webhooks/${id(webhookId)}`),
	};
}

export type TracklinesClient = ReturnType<typeof tracklines>;
