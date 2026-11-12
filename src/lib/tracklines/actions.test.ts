import { getPool } from "~/lib/db";
import { flagEnabled } from "~/lib/flags";
import { retroActionItems, syncRetroActions } from "./actions";
import { clientFor } from "./connection";

jest.mock("~/lib/db", () => ({ getPool: jest.fn() }));
jest.mock("~/lib/flags", () => ({ flagEnabled: jest.fn() }));
jest.mock("./connection", () => ({ clientFor: jest.fn() }));
const query = jest.fn();
const release = jest.fn();
const api = {
	board: jest.fn(),
	actionTickets: jest.fn(),
	createBacklogTask: jest.fn(),
};
const card = {
	id: "card",
	content: "Fix flaky tests\nAdd coverage",
	is_masked: false,
	phase: "completed",
	user_id: "owner",
	tracklines_board_id: "source-board",
	sprint_id: "sprint",
	retro_name: "Sprint 22 retro",
	ticket_id: null,
};
const ticket = { id: "ticket", key: "TL-5" };
beforeEach(() => {
	jest.clearAllMocks();
	(getPool as jest.Mock).mockReturnValue({
		query,
		connect: async () => ({ query, release }),
	});
	(flagEnabled as jest.Mock).mockResolvedValue(true);
	(clientFor as jest.Mock).mockResolvedValue(api);
	api.board.mockResolvedValue({
		id: "source-board",
		project_id: "project",
		name: "Frontend",
	});
	api.actionTickets.mockResolvedValue([]);
	api.createBacklogTask.mockResolvedValue(ticket);
	query.mockImplementation(async (sql: string) => ({
		rows: sql.startsWith("SELECT c.id FROM")
			? [{ id: "card" }]
			: sql.includes("FOR UPDATE OF c")
				? [{ ...card }]
				: [],
	}));
});
it("creates a backlog task using the retro owner's connection and source board's project", async () => {
	await syncRetroActions("retro");
	expect(clientFor).toHaveBeenCalledWith("owner");
	expect(api.createBacklogTask).toHaveBeenCalledWith(
		"project",
		expect.objectContaining({
			title: "Fix flaky tests",
			description: expect.stringContaining("Sprint 22 retro"),
			labels: ["retro-action", "retro-action-card", "Frontend"],
		}),
	);
	expect(query).toHaveBeenCalledWith(
		expect.stringContaining("SET ticket_id=$2"),
		["card", "ticket", "TL-5"],
	);
	expect(release).toHaveBeenCalled();
});
it("does nothing when the flag is disabled", async () => {
	(flagEnabled as jest.Mock).mockResolvedValue(false);
	await syncRetroActions("retro");
	expect(getPool).not.toHaveBeenCalled();
	expect(clientFor).not.toHaveBeenCalled();
});
it("leaves normal retros and feedback cards untouched", async () => {
	query.mockResolvedValue({ rows: [] });
	await syncRetroActions("ordinary");
	expect(clientFor).not.toHaveBeenCalled();
});
it("does not resend an already linked action", async () => {
	query.mockImplementation(async (sql: string) => ({
		rows: sql.startsWith("SELECT c.id FROM")
			? [{ id: "card" }]
			: sql.includes("FOR UPDATE OF c")
				? [{ ...card, ticket_id: "ticket" }]
				: [],
	}));
	await syncRetroActions("retro");
	expect(api.createBacklogTask).not.toHaveBeenCalled();
});
it("does not send masked feedback before reveal", async () => {
	query.mockImplementation(async (sql: string) => ({
		rows: sql.startsWith("SELECT c.id FROM")
			? [{ id: "card" }]
			: sql.includes("FOR UPDATE OF c")
				? [{ ...card, is_masked: true }]
				: [],
	}));
	await syncRetroActions("retro");
	expect(clientFor).not.toHaveBeenCalled();
});
it("recovers upstream success after a lost response without creating another task", async () => {
	api.actionTickets.mockResolvedValue([
		{ ...ticket, description: "Source action: retro-action-card" },
	]);
	await syncRetroActions("retro");
	expect(api.createBacklogTask).not.toHaveBeenCalled();
	expect(query).toHaveBeenCalledWith(
		expect.stringContaining("SET ticket_id=$2"),
		["card", "ticket", "TL-5"],
	);
});
it("persists an upstream error and lets the same local card be retried", async () => {
	api.createBacklogTask.mockRejectedValueOnce(new Error("TrackLin.es offline"));
	await expect(syncRetroActions("retro")).resolves.toBeUndefined();
	expect(query).toHaveBeenCalledWith(
		expect.stringContaining("SET sync_error=$2"),
		["card", "TrackLin.es offline"],
	);
	await syncRetroActions("retro");
	expect(query).toHaveBeenCalledWith(
		expect.stringContaining("SET ticket_id=$2"),
		["card", "ticket", "TL-5"],
	);
});
it("keeps a disconnected owner's action pending", async () => {
	(clientFor as jest.Mock).mockResolvedValue(null);
	await syncRetroActions("retro");
	expect(query).toHaveBeenCalledWith(
		expect.stringContaining("SET sync_error=$2"),
		["card", expect.stringContaining("Reconnect")],
	);
	expect(api.createBacklogTask).not.toHaveBeenCalled();
});
it("status hides masked card text", async () => {
	query.mockResolvedValueOnce({ rows: [{}] }).mockResolvedValueOnce({
		rows: [{ id: "card", content: "secret", is_masked: true }],
	});
	expect((await retroActionItems("retro")).actions[0]).toEqual(
		expect.objectContaining({ content: "", waitingForReveal: true }),
	);
});

it("never exports before the retro is completed, including direct retries", async () => {
	query.mockImplementation(async (sql: string) => ({
		rows: sql.startsWith("SELECT c.id FROM")
			? [{ id: "card" }]
			: sql.includes("FOR UPDATE OF c")
				? [{ ...card, phase: "discussion" }]
				: [],
	}));
	await syncRetroActions("retro");
	expect(clientFor).not.toHaveBeenCalled();
	expect(api.createBacklogTask).not.toHaveBeenCalled();
});
