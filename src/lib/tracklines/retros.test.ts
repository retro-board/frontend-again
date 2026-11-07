import { tracklines } from "./client";
import { type Connection, clientFor } from "./connection";
import {
	createSprintRetro,
	loadSprintItems,
	saveCardItems,
	selectedItems,
} from "./retros";

const query = jest.fn();
const release = jest.fn();
jest.mock("~/lib/db", () => ({
	getPool: () => ({ query, connect: async () => ({ query, release }) }),
	identifier: (key: string) => `"${key}"`,
}));
jest.mock("./client", () => ({ tracklines: jest.fn() }));
jest.mock("./connection", () => ({ clientFor: jest.fn() }));
jest.mock("./security", () => ({ open: () => "service-key" }));
const sprintId = "11111111-1111-4111-8111-111111111111";
const ticketId = "22222222-2222-4222-8222-222222222222";
const item = {
	id: ticketId,
	key: "TL-1",
	title: "Ship",
	estimate: "3",
	url: `https://tracklin.es/tickets/${ticketId}`,
};
const event = {
	event: "sprint.started" as const,
	data: { board_id: sprintId, sprint: { id: sprintId, number: 22 } },
};
const connection = {
	id: "connection",
	user_id: "user",
	service_key: "sealed",
} as Connection;
const api = { board: jest.fn(), sprint: jest.fn(), projects: jest.fn() };
beforeEach(() => {
	jest.clearAllMocks();
	query.mockReset().mockResolvedValue({ rows: [] });
	api.board.mockResolvedValue({
		id: sprintId,
		name: "Frontend",
		project_id: "project",
	});
	api.sprint.mockResolvedValue({
		id: sprintId,
		board_id: sprintId,
		number: 22,
		tickets: [item],
	});
	api.projects.mockResolvedValue([{ id: "project", name: "TrackLines" }]);
	(tracklines as jest.Mock).mockReturnValue(api);
	(clientFor as jest.Mock).mockResolvedValue(api);
});

test("creates one board with default columns and owner membership, ignoring duplicate deliveries", async () => {
	let created = false;
	query.mockImplementation(async (sql: string) => {
		if (sql.startsWith("SELECT board_id"))
			return { rows: created ? [{ board_id: "retro" }] : [] };
		if (sql.startsWith("INSERT INTO boards"))
			return { rows: [{ id: "retro" }] };
		if (sql.startsWith("INSERT INTO tracklines_retros")) created = true;
		return { rows: [] };
	});
	expect(await createSprintRetro(connection, event)).toBe("retro");
	expect(await createSprintRetro(connection, event)).toBe("retro");
	expect(
		query.mock.calls.filter(([sql]) => sql.startsWith("INSERT INTO boards")),
	).toHaveLength(1);
	expect(query).toHaveBeenCalledWith(
		expect.stringContaining("INSERT INTO boards"),
		["TrackLines - Frontend - Sprint 22", "user"],
	);
	expect(query).toHaveBeenCalledWith(expect.stringContaining("Action Items"), [
		"retro",
	]);
	expect(query).toHaveBeenCalledWith(
		expect.stringContaining("board_participants"),
		["retro", "user"],
	);
});

test("refuses events from boards the connected key cannot access", async () => {
	api.board.mockRejectedValue(new Error("not found"));
	await expect(createSprintRetro(connection, event)).rejects.toThrow(
		"not found",
	);
	expect(query).not.toHaveBeenCalled();
});

test("rolls back if initial column creation fails", async () => {
	query.mockImplementation(async (sql: string) => {
		if (sql.startsWith("INSERT INTO boards"))
			return { rows: [{ id: "retro" }] };
		if (sql.startsWith("INSERT INTO columns")) throw new Error("offline");
		return { rows: [] };
	});
	await expect(createSprintRetro(connection, event)).rejects.toThrow("offline");
	expect(query).toHaveBeenCalledWith("ROLLBACK");
	expect(release).toHaveBeenCalled();
});

test("refreshes the exact sprint, including closed sprints, and caches its ticket list", async () => {
	query.mockResolvedValueOnce({
		rows: [
			{
				user_id: "user",
				sprint_id: sprintId,
				tracklines_board_id: sprintId,
				items: [],
			},
		],
	});
	expect(await loadSprintItems("retro")).toEqual({
		items: [item],
		linked: true,
		stale: false,
	});
	expect(api.sprint).toHaveBeenCalledWith(sprintId);
	expect(query).toHaveBeenCalledWith(
		expect.stringContaining("UPDATE tracklines_retros"),
		["retro", JSON.stringify([item])],
	);
});

test("returns the saved list with a note when TrackLin.es is unreachable or disconnected", async () => {
	query.mockResolvedValue({ rows: [{ user_id: "user", items: [item] }] });
	(clientFor as jest.Mock).mockResolvedValue(null);
	expect(await loadSprintItems("retro")).toEqual(
		expect.objectContaining({
			items: [item],
			stale: true,
			note: expect.any(String),
		}),
	);
	(clientFor as jest.Mock).mockResolvedValue(api);
	api.sprint.mockRejectedValue(new Error("offline"));
	expect((await loadSprintItems("retro")).stale).toBe(true);
});

test("only accepts ticket IDs in this board's cached sprint and removes duplicate choices", async () => {
	query.mockResolvedValue({ rows: [{ items: [item] }] });
	expect(await selectedItems("retro", [ticketId, ticketId])).toEqual([item]);
	await expect(selectedItems("retro", [sprintId])).rejects.toThrow(
		"Select items",
	);
	await expect(selectedItems("retro", ["not-a-ticket"])).rejects.toThrow();
});

test("anonymous authors can link and unlink items without storing their identity on a link", async () => {
	query.mockImplementation(async (sql: string) => ({
		rows:
			sql.startsWith("SELECT c.id") || sql.startsWith("UPDATE cards")
				? [{ id: "card" }]
				: [],
	}));
	const scope = {
		cardId: "card",
		boardId: "retro",
		authorId: "guest",
		anonymous: true,
	};
	expect(
		(await saveCardItems({ content: "Feedback" }, [item], scope)).error,
	).toBeNull();
	expect(query).toHaveBeenCalledWith(
		expect.stringContaining("c.anonymous_author_id=$3"),
		["card", "retro", "guest"],
	);
	expect(query).toHaveBeenCalledWith(
		expect.stringContaining("INSERT INTO card_items"),
		["card", ticketId, "TL-1", "Ship", item.url],
	);
	query.mockClear();
	expect(
		(await saveCardItems({ content: "Feedback" }, [], scope)).error,
	).toBeNull();
	expect(query).toHaveBeenCalledWith(
		"DELETE FROM card_items WHERE card_id=$1",
		["card"],
	);
	expect(
		query.mock.calls.some(([sql]) => sql.startsWith("INSERT INTO card_items")),
	).toBe(false);
});

test("another author's or another board's card cannot have its links overwritten", async () => {
	const result = await saveCardItems({ content: "bad" }, [], {
		cardId: "card",
		boardId: "other",
		authorId: "outsider",
		anonymous: false,
	});
	expect(result.error?.message).toContain("Only the card author");
	expect(query).toHaveBeenCalledWith("ROLLBACK");
	expect(
		query.mock.calls.some(([sql]) => sql.startsWith("DELETE FROM card_items")),
	).toBe(false);
});
