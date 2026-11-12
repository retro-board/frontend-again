import { cookies } from "next/headers";
import {
	createMockRequest,
	setupAuthenticatedUser,
	setupCookiesMock,
	setupDatabaseMocks,
} from "~/test/helpers";
import { GET as getBoard } from "../boards/[boardId]/route";
import { GET as getPoker } from "../poker-sessions/[sessionId]/route";
import { POST as createAnonymous } from "./create/route";
import { GET as getAnonymous } from "./current/route";

jest.mock("@clerk/nextjs/server");
jest.mock("next/headers");
jest.mock("~/lib/db");
jest.mock("next/server", () => ({
	NextResponse: {
		json: (data: unknown, init?: ResponseInit) =>
			Object.assign(new Response(JSON.stringify(data), init), {
				cookies: { set: jest.fn() },
			}),
	},
}));

beforeEach(() => {
	jest.clearAllMocks();
	setupAuthenticatedUser();
	(cookies as unknown as jest.Mock).mockResolvedValue(
		setupCookiesMock({ anonymous_session_id: "secret-cookie" }),
	);
});

it.each([
	"board",
	"poker",
])("limits nested anonymous projections in %s responses", async (kind) => {
	const mocks = setupDatabaseMocks();
	mocks.maybeSingleMock.mockResolvedValue({
		data: { id: "member" },
		error: null,
	});
	mocks.singleMock.mockResolvedValue({
		data: { id: "resource", stories: [] },
		error: null,
	});
	mocks.orderMock.mockResolvedValue({ data: [], error: null });
	const request = createMockRequest("http://localhost");
	const response =
		kind === "board"
			? await getBoard(request, {
					params: Promise.resolve({ boardId: "board" }),
				})
			: await getPoker(request, {
					params: Promise.resolve({ sessionId: "poker" }),
				});
	expect(response.status).toBe(200);
	const projections = mocks.selectMock.mock.calls
		.map(([projection]) => projection)
		.filter((projection) => projection?.includes("anonymous_users("));
	expect(projections).toHaveLength(1);
	expect(projections[0]).not.toContain("anonymous_users(*)");
	expect(projections[0]).toContain("anonymous_users(id, display_name)");
	expect(JSON.stringify(await response.json())).not.toContain("session_id");
});

it.each([
	"current",
	"create",
	"update",
])("keeps credentials out of the anonymous %s projection", async (kind) => {
	const mocks = setupDatabaseMocks();
	const user = { id: "anonymous", display_name: "Guest" };
	mocks.maybeSingleMock.mockResolvedValue({
		data: kind === "create" ? null : user,
		error: null,
	});
	mocks.singleMock.mockResolvedValue({ data: user, error: null });
	const response =
		kind === "current"
			? await getAnonymous()
			: await createAnonymous(
					createMockRequest("http://localhost", {
						method: "POST",
						body: { displayName: "Guest" },
					}),
				);
	expect(response.status).toBe(200);
	expect(await response.json()).toEqual({ user });
	for (const [projection] of mocks.selectMock.mock.calls) {
		expect(projection).toBe("id, display_name");
	}
});
