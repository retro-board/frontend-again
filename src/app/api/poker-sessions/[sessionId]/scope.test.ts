import { cookies } from "next/headers";
import {
	createMockRequest,
	mockDbUser,
	setupAuthenticatedUser,
	setupCookiesMock,
	setupDatabaseMocks,
} from "~/test/helpers";
import { PATCH } from "./route";
import { POST as score } from "./score/route";
import { DELETE as reset, POST as vote } from "./votes/route";

jest.mock("@clerk/nextjs/server");
jest.mock("next/headers");
jest.mock("~/lib/db");
jest.mock("~/lib/tracklines/poker", () => ({ syncStoryEstimate: jest.fn() }));
let mocks: ReturnType<typeof setupDatabaseMocks>;
const params = { params: Promise.resolve({ sessionId: "session" }) };
beforeEach(() => {
	jest.clearAllMocks();
	setupAuthenticatedUser();
	(cookies as unknown as jest.Mock).mockResolvedValue(setupCookiesMock());
	mocks = setupDatabaseMocks();
	mocks.maybeSingleMock
		.mockResolvedValueOnce({ data: mockDbUser })
		.mockResolvedValueOnce({ data: { role: "facilitator" } });
	mocks.singleMock.mockResolvedValue({
		data: {
			id: mockDbUser.id,
			owner_id: mockDbUser.id,
			estimation_type: "fibonacci",
		},
	});
});
it.each([
	PATCH,
	score,
	reset,
	vote,
])("rejects foreign stories before mutation (%#)", async (handler) => {
	// Reset authenticates with single(), so its first maybeSingle() is the scoped story lookup.
	if (handler === reset)
		mocks.maybeSingleMock.mockReset().mockResolvedValue({ data: null });
	const response = await handler(
		createMockRequest("http://localhost", {
			method: "POST",
			body: { storyId: "foreign", current_story_id: "foreign", vote: "3" },
		}),
		params,
	);
	expect(response.status).toBe(404);
	expect(mocks.updateMock).not.toHaveBeenCalled();
	expect(mocks.deleteMock).not.toHaveBeenCalled();
	expect(mocks.insertMock).not.toHaveBeenCalled();
});
it("refuses off-scale votes before writing", async () => {
	mocks.maybeSingleMock.mockResolvedValueOnce({ data: { id: "story" } });
	const response = await vote(
		createMockRequest("http://localhost", {
			method: "POST",
			body: { storyId: "story", vote: "999" },
		}),
		params,
	);
	expect(response.status).toBe(400);
	expect(mocks.insertMock).not.toHaveBeenCalled();
});
