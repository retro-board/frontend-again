import { flagEnabled } from "~/lib/flags";
import { authorizeChannel } from "~/lib/realtime/authorize";
import { planningState, planPokerStories } from "~/lib/tracklines/poker";
import { GET, POST } from "./route";

jest.mock("~/lib/flags", () => ({ flagEnabled: jest.fn() }));
jest.mock("~/lib/realtime/authorize", () => ({ authorizeChannel: jest.fn() }));
jest.mock("~/lib/tracklines/poker", () => ({
	...jest.requireActual("~/lib/tracklines/poker"),
	planningState: jest.fn(),
	planPokerStories: jest.fn(),
}));
const context = {
	params: Promise.resolve({
		sessionId: "11111111-1111-4111-8111-111111111111",
	}),
};
const request = () =>
	new Request("https://retro.test/api", {
		method: "POST",
		body: JSON.stringify({
			plans: [
				{
					story_id: "22222222-2222-4222-8222-222222222222",
					planned_sprint_id: "33333333-3333-4333-8333-333333333333",
					estimate: "999",
				},
			],
		}),
	});
beforeEach(() => {
	jest.clearAllMocks();
	(flagEnabled as jest.Mock).mockResolvedValue(true);
	(authorizeChannel as jest.Mock).mockResolvedValue({ role: "facilitator" });
	(planPokerStories as jest.Mock).mockResolvedValue([]);
});
test("blocks outsiders, observers, and disabled feature access", async () => {
	(authorizeChannel as jest.Mock)
		.mockResolvedValueOnce(null)
		.mockResolvedValueOnce({ role: "observer" });
	expect((await POST(request(), context)).status).toBe(403);
	expect((await POST(request(), context)).status).toBe(403);
	(flagEnabled as jest.Mock).mockResolvedValue(false);
	expect((await GET(request(), context)).status).toBe(403);
	expect(planPokerStories).not.toHaveBeenCalled();
});
test("only passes session-scoped ticket selections to the planner; client estimates are stripped", async () => {
	expect((await POST(request(), context)).status).toBe(200);
	expect(planPokerStories).toHaveBeenCalledWith(
		"11111111-1111-4111-8111-111111111111",
		[
			{
				story_id: "22222222-2222-4222-8222-222222222222",
				planned_sprint_id: "33333333-3333-4333-8333-333333333333",
			},
		],
	);
});
test("returns only public planning state, never the API client or credentials", async () => {
	(planningState as jest.Mock).mockResolvedValue({
		session: { tracklines_board_id: "board", owner_id: "private" },
		api: { secret: "secret" },
		sprints: [],
		stories: [],
	});
	expect(await (await GET(request(), context)).json()).toEqual({
		sprints: [],
		stories: [],
		boardUrl: "https://tracklin.es/boards/board",
	});
});
