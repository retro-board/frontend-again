import { syncRetroActions } from "~/lib/tracklines/actions";
import {
	createMockRequest,
	mockDbUser,
	setupAuthenticatedUser,
	setupDatabaseMocks,
} from "~/test/helpers";
import { POST } from "./route";

jest.mock("@clerk/nextjs/server");
jest.mock("~/lib/db");
jest.mock("~/lib/tracklines/actions", () => ({ syncRetroActions: jest.fn() }));
jest.mock("~/lib/realtime/broadcast", () => ({
	broadcastBoardEvent: jest.fn(),
}));
beforeEach(() => {
	jest.clearAllMocks();
	setupAuthenticatedUser();
});
it.each([
	"creation",
	"discussion",
	"completed",
])("exports only when advancing to completed (next: %s)", async (nextPhase) => {
	const mocks = setupDatabaseMocks();
	mocks.maybeSingleMock.mockResolvedValue({ data: mockDbUser, error: null });
	mocks.singleMock
		.mockResolvedValueOnce({
			data: {
				owner_id: mockDbUser.id,
				phase:
					nextPhase === "completed"
						? "discussion"
						: nextPhase === "discussion"
							? "voting"
							: "join",
			},
		})
		.mockResolvedValueOnce({ data: { phase: nextPhase }, error: null });
	const response = await POST(
		createMockRequest("http://localhost", {
			method: "POST",
			body: { action: "advance" },
		}),
		{ params: Promise.resolve({ boardId: "retro" }) },
	);
	expect(response.status).toBe(200);
	expect(syncRetroActions).toHaveBeenCalledTimes(
		nextPhase === "completed" ? 1 : 0,
	);
});
