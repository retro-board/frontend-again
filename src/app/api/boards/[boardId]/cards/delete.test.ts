import { cookies } from "next/headers";
import { authorizeChannel } from "~/lib/realtime/authorize";
import { broadcastToBoard } from "~/lib/realtime/channels-server";
import {
	createMockRequest,
	mockDbUser,
	setupAuthenticatedUser,
	setupCookiesMock,
	setupDatabaseMocks,
} from "~/test/helpers";
import { DELETE } from "./route";

jest.mock("@clerk/nextjs/server");
jest.mock("~/lib/db");
jest.mock("next/headers");
jest.mock("~/lib/realtime/authorize");
jest.mock("~/lib/realtime/channels-server", () => ({
	broadcastToBoard: jest.fn(),
}));
let mocks: ReturnType<typeof setupDatabaseMocks>;
const remove = () =>
	DELETE(createMockRequest("http://localhost?cardId=card"), {
		params: Promise.resolve({ boardId: "board" }),
	});
beforeEach(() => {
	jest.clearAllMocks();
	setupAuthenticatedUser();
	(cookies as unknown as jest.Mock).mockResolvedValue(setupCookiesMock());
	(authorizeChannel as jest.Mock).mockResolvedValue({
		user: { id: mockDbUser.id },
	});
	mocks = setupDatabaseMocks();
});
it("rejects nonparticipants before card access or publication", async () => {
	(authorizeChannel as jest.Mock).mockResolvedValue(null);
	expect((await remove()).status).toBe(403);
	expect(mocks.fromMock).not.toHaveBeenCalled();
	expect(broadcastToBoard).not.toHaveBeenCalled();
});
it("rejects cards from a different board", async () => {
	mocks.singleMock.mockResolvedValue({
		data: { column: { board_id: "other", board: { phase: "creation" } } },
	});
	expect((await remove()).status).toBe(404);
	expect(broadcastToBoard).not.toHaveBeenCalled();
});
it.each([
	false,
	true,
])("only publishes when a row was deleted (deleted: %s)", async (deleted) => {
	mocks.singleMock.mockResolvedValue({
		data: { column: { board_id: "board", board: { phase: "creation" } } },
	});
	mocks.maybeSingleMock
		.mockResolvedValueOnce({ data: mockDbUser })
		.mockResolvedValueOnce({
			data: deleted ? { id: "card" } : null,
			error: null,
		});
	expect((await remove()).status).toBe(deleted ? 200 : 404);
	expect(broadcastToBoard).toHaveBeenCalledTimes(deleted ? 1 : 0);
});
