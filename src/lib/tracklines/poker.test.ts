import { clientFor } from "./connection";
import {
	createTracklinesPoker,
	planningState,
	planPokerStories,
	pokerBacklog,
} from "./poker";
import { tracklinesScale } from "./scales";

const query = jest.fn();
const release = jest.fn();
jest.mock("~/lib/db", () => ({
	getPool: () => ({ query, connect: async () => ({ query, release }) }),
}));
jest.mock("./connection", () => ({ clientFor: jest.fn() }));
const api = {
	board: jest.fn(),
	backlog: jest.fn(),
	attachments: jest.fn(),
	plannedSprints: jest.fn(),
	planTicket: jest.fn(),
};
const future = { id: "future", board_id: "board", number: 23 };
const session = {
	id: "session",
	owner_id: "owner",
	tracklines_board_id: "board",
	estimation_values: ["1", "2", "4", "8", "16"],
};
const story = {
	id: "story",
	session_id: "session",
	tracklines_ticket_id: "ticket",
	is_estimated: true,
	final_estimate: "4",
};
const input = {
	name: "Poker",
	project_id: "project",
	board_id: "board",
	result_method: "average" as const,
};
beforeEach(() => {
	jest.clearAllMocks();
	query.mockReset().mockResolvedValue({ rows: [] });
	(clientFor as jest.Mock).mockResolvedValue(api);
	api.board.mockResolvedValue({
		id: "board",
		project_id: "project",
		estimate_scale: "powers",
		sprint: { id: "current" },
	});
	api.backlog.mockResolvedValue([
		{
			id: "ticket",
			key: "TL-1",
			title: "Ship",
			type: "task",
			description: "**Details**",
		},
		{ id: "epic", type: "epic" },
		{ id: "done", resolution: "done" },
	]);
	api.attachments.mockResolvedValue([
		{
			id: "file",
			name: "design.png",
			url: "https://files.test/design",
			content_type: "image/png",
		},
	]);
	api.plannedSprints.mockResolvedValue([
		future,
		{ id: "current", board_id: "board" },
		{ id: "other", board_id: "elsewhere" },
	]);
	api.planTicket.mockReset().mockResolvedValue(undefined);
});
function planningRows(stories = [story]) {
	query.mockImplementation(async (sql: string, values: unknown[]) => ({
		rows: sql.startsWith("SELECT * FROM poker_sessions")
			? [session]
			: sql.startsWith("SELECT * FROM stories")
				? stories.filter((row) => row.id === values[1])
				: sql.startsWith("SELECT id,title")
					? stories
					: [],
	}));
}
test("imports backlog stories and attachments atomically on the board's scale", async () => {
	query.mockImplementation(async (sql: string) => ({
		rows: sql.startsWith("INSERT INTO poker_sessions") ? [session] : [],
	}));
	expect(await createTracklinesPoker("owner", input)).toEqual(session);
	expect(query).toHaveBeenCalledWith(
		expect.stringContaining("INSERT INTO poker_sessions"),
		[
			"Poker",
			null,
			"owner",
			"powers",
			"average",
			"project",
			"board",
			["1", "2", "4", "8", "16"],
		],
	);
	expect(api.attachments).toHaveBeenCalledTimes(1);
	expect(query).toHaveBeenCalledWith(
		expect.stringContaining("INSERT INTO stories"),
		expect.arrayContaining(["ticket", "TL-1", "**Details**"]),
	);
	expect(query).toHaveBeenCalledWith("COMMIT");
});
test("rejects no-scale boards, the wrong project, and disconnected accounts", async () => {
	api.board.mockResolvedValueOnce({
		id: "board",
		project_id: "project",
		estimate_scale: "none",
	});
	await expect(pokerBacklog(api as never, "project", "board")).rejects.toThrow(
		"estimate scale",
	);
	await expect(pokerBacklog(api as never, "other", "board")).rejects.toThrow(
		"another project",
	);
	(clientFor as jest.Mock).mockResolvedValue(null);
	await expect(createTracklinesPoker("owner", input)).rejects.toThrow(
		"Connect TrackLin.es",
	);
	expect(query).not.toHaveBeenCalled();
});
test.each([
	"fibonacci",
	"tshirt",
	"powers",
	"linear",
])("supports TrackLin.es %s and refuses none", (scale) => {
	expect(tracklinesScale(scale).values.length).toBeGreaterThan(0);
	expect(tracklinesScale(scale).type).toBe(scale);
	expect(() => tracklinesScale("none")).toThrow();
});
test("does not create a partial session when attachments are unavailable", async () => {
	api.attachments.mockRejectedValueOnce(
		new Error("TrackLin.es refused attachments"),
	);
	await expect(createTracklinesPoker("owner", input)).rejects.toThrow(
		"refused attachments",
	);
	expect(query).not.toHaveBeenCalled();
});
test("offers future sprints only, filtering unexpected current/other-board entries", async () => {
	planningRows();
	expect((await planningState("session")).sprints).toEqual([future]);
});
test("writes the stored result only to an offered future sprint", async () => {
	planningRows();
	expect(
		await planPokerStories("session", [
			{ story_id: "story", planned_sprint_id: "future" },
		]),
	).toEqual([
		{ story_id: "story", status: "planned", planned_sprint_id: "future" },
	]);
	expect(api.planTicket).toHaveBeenCalledWith("ticket", "future", "4");
	expect(query).toHaveBeenCalledWith(
		expect.stringContaining("SET tracklines_planned_sprint_id"),
		["story", "future", "session"],
	);
});
test("cannot plan into the current sprint or with a result outside the board scale", async () => {
	planningRows();
	expect(
		(
			await planPokerStories("session", [
				{ story_id: "story", planned_sprint_id: "current" },
			])
		)[0]?.error,
	).toContain("current sprint");
	planningRows([{ ...story, final_estimate: "999" }]);
	expect(
		(
			await planPokerStories("session", [
				{ story_id: "story", planned_sprint_id: "future" },
			])
		)[0]?.status,
	).toBe("failed");
	expect(api.planTicket).not.toHaveBeenCalled();
});
test("skips abstained and unestimated stories, and isolates another session's story", async () => {
	planningRows([{ ...story, final_estimate: "?" }]);
	expect(
		(
			await planPokerStories("session", [
				{ story_id: "story", planned_sprint_id: "future" },
			])
		)[0]?.status,
	).toBe("skipped");
	expect(
		(
			await planPokerStories("session", [
				{ story_id: "other-story", planned_sprint_id: "future" },
			])
		)[0]?.status,
	).toBe("failed");
	expect(api.planTicket).not.toHaveBeenCalled();
});
test("preserves per-ticket failures and retries only the requested failed ticket", async () => {
	planningRows([
		story,
		{ ...story, id: "second", tracklines_ticket_id: "ticket2" },
	]);
	api.planTicket.mockRejectedValueOnce(new Error("capacity approval needed"));
	const outcomes = await planPokerStories("session", [
		{ story_id: "story", planned_sprint_id: "future" },
		{ story_id: "second", planned_sprint_id: "future" },
	]);
	expect(outcomes.map((row) => row.status)).toEqual(["failed", "planned"]);
	expect(outcomes[0]?.error).toBe("capacity approval needed");
	api.planTicket.mockClear();
	expect(
		(
			await planPokerStories("session", [
				{ story_id: "story", planned_sprint_id: "future" },
			])
		)[0]?.status,
	).toBe("planned");
	expect(api.planTicket).toHaveBeenCalledTimes(1);
});
test("an empty planned-sprint list cannot be bypassed by submitting an ID", async () => {
	planningRows();
	api.plannedSprints.mockResolvedValue([]);
	expect((await planningState("session")).sprints).toEqual([]);
	expect(
		(
			await planPokerStories("session", [
				{ story_id: "story", planned_sprint_id: "future" },
			])
		)[0]?.status,
	).toBe("failed");
	expect(api.planTicket).not.toHaveBeenCalled();
});
