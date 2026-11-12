import { cookies } from "next/headers";
import {
	createMockRequest,
	mockDbUser,
	setupAuthenticatedUser,
	setupCookiesMock,
	setupDatabaseMocks,
} from "~/test/helpers";
import { PATCH } from "./route";

jest.mock("@clerk/nextjs/server");
jest.mock("~/lib/db");
jest.mock("next/headers");
let mocks: ReturnType<typeof setupDatabaseMocks>;
const patch = (body: object) =>
	PATCH(
		createMockRequest("http://localhost", {
			method: "PATCH",
			body: { cardId: "card", position: 2, ...body },
		}),
		{ params: Promise.resolve({ boardId: "board" }) },
	);
beforeEach(() => {
	jest.clearAllMocks();
	setupAuthenticatedUser();
	(cookies as unknown as jest.Mock).mockResolvedValue(setupCookiesMock());
	mocks = setupDatabaseMocks();
	mocks.maybeSingleMock.mockResolvedValueOnce({
		data: mockDbUser,
		error: null,
	});
});
it("rejects nonparticipants without touching cards", async () => {
	expect((await patch({})).status).toBe(403);
	expect(mocks.updateMock).not.toHaveBeenCalled();
});
it("rejects a card belonging to a different board", async () => {
	mocks.maybeSingleMock.mockResolvedValueOnce({ data: { id: "member" } });
	mocks.singleMock.mockResolvedValueOnce({
		data: { columns: { board_id: "other" } },
	});
	expect((await patch({})).status).toBe(404);
	expect(mocks.updateMock).not.toHaveBeenCalled();
});
it("rejects moving another author's card as an ordinary participant", async () => {
	mocks.maybeSingleMock.mockResolvedValueOnce({ data: { id: "member" } });
	mocks.singleMock.mockResolvedValueOnce({
		data: {
			author_id: "other",
			columns: { board_id: "board", board: { owner_id: "owner" } },
		},
	});
	expect((await patch({})).status).toBe(403);
	expect(mocks.updateMock).not.toHaveBeenCalled();
});
it("rejects a destination on a different board", async () => {
	mocks.maybeSingleMock.mockResolvedValueOnce({ data: { id: "member" } });
	mocks.singleMock
		.mockResolvedValueOnce({
			data: {
				author_id: mockDbUser.id,
				columns: { board_id: "board", board: { owner_id: "owner" } },
			},
		})
		.mockResolvedValueOnce({ data: { board_id: "other" } });
	expect((await patch({ column_id: "foreign" })).status).toBe(404);
	expect(mocks.updateMock).not.toHaveBeenCalled();
});
it.each(["author", "owner"])("allows the %s to move a card", async (role) => {
	mocks.maybeSingleMock.mockResolvedValueOnce({ data: { id: "member" } });
	mocks.singleMock
		.mockResolvedValueOnce({
			data: {
				author_id: role === "author" ? mockDbUser.id : "other",
				columns: {
					board_id: "board",
					board: { owner_id: role === "owner" ? mockDbUser.id : "other" },
				},
			},
		})
		.mockResolvedValueOnce({
			data: { id: "card", column_id: "column", position: 2 },
			error: null,
		});
	expect((await patch({})).status).toBe(200);
});

it.each([
	"creation",
	"reveal",
	"voting",
	"discussion",
	"completed",
])("enforces content edit rules in %s", async (phase) => {
	mocks.maybeSingleMock.mockResolvedValueOnce({ data: { id: "member" } });
	mocks.singleMock
		.mockResolvedValueOnce({
			data: {
				author_id: mockDbUser.id,
				columns: {
					board_id: "board",
					board: { owner_id: mockDbUser.id, phase },
				},
			},
		})
		.mockResolvedValueOnce({
			data: { id: "card", column_id: "column", position: 2 },
			error: null,
		});
	expect((await patch({ content: "changed" })).status).toBe(
		phase === "creation" ? 200 : 403,
	);
	if (phase !== "creation") expect(mocks.updateMock).not.toHaveBeenCalled();
});
