import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { POST as abstain } from "~/app/api/poker/[sessionId]/abstain/route";
import { POST as score } from "~/app/api/poker/[sessionId]/score/route";
import { POST as vote } from "~/app/api/poker/[sessionId]/votes/route";
import {
	GET as status,
	POST as voting,
} from "~/app/api/poker/[sessionId]/voting/route";
import { authorizeChannel } from "~/lib/realtime/authorize";
import {
	createMockRequest,
	setupCookiesMock,
	setupDatabaseMocks,
} from "~/test/helpers";

jest.mock("@clerk/nextjs/server");
jest.mock("next/headers");
jest.mock("~/lib/db");
jest.mock("~/lib/realtime/authorize");
jest.mock("~/lib/tracklines/poker", () => ({ syncStoryEstimate: jest.fn() }));
const params = { params: Promise.resolve({ sessionId: "session" }) };
const request = (body = {}) =>
	createMockRequest("http://localhost?storyId=story", { method: "POST", body });
const mockAuth = auth as unknown as jest.Mock;
const mockAuthorize = authorizeChannel as jest.Mock;
let mocks: ReturnType<typeof setupDatabaseMocks>;
beforeEach(() => {
	jest.clearAllMocks();
	mocks = setupDatabaseMocks();
	mockAuth.mockResolvedValue({ userId: null });
	(cookies as unknown as jest.Mock).mockResolvedValue(setupCookiesMock({}));
});
it.each([
	abstain,
	score,
	vote,
	status,
	voting,
])("rejects missing credentials before database access (%#)", async (handler) => {
	expect(
		(await handler(request({ anonymousUserId: "victim" }), params)).status,
	).toBe(401);
	expect(mocks.fromMock).not.toHaveBeenCalled();
});
it.each([
	"start",
	"end",
	"score",
])("rejects a voter controlling %s", async (action) => {
	mockAuth.mockResolvedValue({ userId: "clerk" });
	mockAuthorize.mockResolvedValue({
		anonymous: false,
		user: { id: "voter" },
		role: "voter",
	});
	const handler = action === "score" ? score : voting;
	expect(
		(await handler(request({ action, storyId: "story" }), params)).status,
	).toBe(403);
	expect(mocks.fromMock).not.toHaveBeenCalled();
});
it.each([
	score,
	vote,
	status,
	voting,
])("rejects a story outside the session (%#)", async (handler) => {
	mockAuth.mockResolvedValue({ userId: "clerk" });
	mockAuthorize.mockResolvedValue({
		anonymous: false,
		user: { id: "owner" },
		role: "facilitator",
	});
	mocks.maybeSingleMock.mockResolvedValue({ data: null, error: null });
	expect(
		(
			await handler(
				request({ action: "start", storyId: "foreign", voteValue: "3" }),
				params,
			)
		).status,
	).toBe(404);
	expect(mocks.eqMock).toHaveBeenCalledWith("session_id", "session");
	expect(mocks.updateMock).not.toHaveBeenCalled();
	expect(mocks.deleteMock).not.toHaveBeenCalled();
});
it("uses cookie identity instead of a supplied anonymous user id", async () => {
	(cookies as unknown as jest.Mock).mockResolvedValue(
		setupCookiesMock({ anonymous_session_id: "cookie" }),
	);
	mockAuthorize.mockResolvedValue({
		anonymous: true,
		user: { id: "actual" },
		role: "voter",
	});
	mocks.maybeSingleMock.mockResolvedValue({
		data: { id: "story" },
		error: null,
	});
	mocks.singleMock.mockResolvedValue({ data: null, error: null });
	const response = await vote(
		request({ storyId: "story", voteValue: "3", anonymousUserId: "victim" }),
		params,
	);
	expect(response.status).toBe(200);
	expect(mocks.insertMock).toHaveBeenCalledWith({
		story_id: "story",
		vote_value: "3",
		anonymous_user_id: "actual",
	});
});
it("rejects nonmembers", async () => {
	mockAuth.mockResolvedValue({ userId: "clerk" });
	mockAuthorize.mockResolvedValue(null);
	expect((await abstain(request(), params)).status).toBe(403);
});
