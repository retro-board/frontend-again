import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { setupDatabaseMocks } from "~/test/helpers";
import { authorizeChannel } from "./authorize";

jest.mock("next/headers");
const channel = "board:11111111-1111-4111-8111-111111111111";
let mocks: ReturnType<typeof setupDatabaseMocks>;
beforeEach(() => {
	jest.clearAllMocks();
	mocks = setupDatabaseMocks();
	(auth as unknown as jest.Mock).mockResolvedValue({ userId: "clerk-user" });
	(cookies as jest.Mock).mockResolvedValue({
		get: jest.fn(() => ({ value: "guest-session" })),
	});
});

test("rejects malformed channel names before querying identities", async () => {
	expect(await authorizeChannel("board:other-room")).toBeNull();
	expect(mocks.fromMock).not.toHaveBeenCalled();
});

test("rejects signed-in users without membership", async () => {
	mocks.maybeSingleMock
		.mockResolvedValueOnce({ data: { id: "outsider" }, error: null })
		.mockResolvedValueOnce({ data: { owner_id: "owner" }, error: null })
		.mockResolvedValueOnce({ data: null, error: null });
	expect(await authorizeChannel(channel)).toBeNull();
	expect(mocks.eqMock).toHaveBeenCalledWith("user_id", "outsider");
});

test("authorizes owners and derives their role from ownership", async () => {
	mocks.maybeSingleMock
		.mockResolvedValueOnce({ data: { id: "owner" }, error: null })
		.mockResolvedValueOnce({ data: { owner_id: "owner" }, error: null });
	expect(await authorizeChannel(channel)).toEqual(
		expect.objectContaining({ role: "owner", anonymous: false }),
	);
});

test("checks anonymous membership using the session cookie", async () => {
	(auth as unknown as jest.Mock).mockResolvedValue({ userId: null });
	mocks.maybeSingleMock
		.mockResolvedValueOnce({ data: { id: "guest" }, error: null })
		.mockResolvedValueOnce({ data: { owner_id: "owner" }, error: null })
		.mockResolvedValueOnce({ data: { id: "membership" }, error: null });
	expect(await authorizeChannel(channel)).toEqual(
		expect.objectContaining({ anonymous: true, user: { id: "guest" } }),
	);
	expect(mocks.eqMock).toHaveBeenCalledWith("session_id", "guest-session");
	expect(mocks.fromMock).toHaveBeenCalledWith("board_anonymous_participants");
	expect(mocks.eqMock).toHaveBeenCalledWith("anonymous_user_id", "guest");
});

test("fails closed when a membership query fails", async () => {
	mocks.maybeSingleMock
		.mockResolvedValueOnce({ data: { id: "owner" }, error: null })
		.mockResolvedValueOnce({ data: { owner_id: "owner" }, error: null })
		.mockResolvedValueOnce({ data: null, error: { message: "offline" } });
	await expect(authorizeChannel(channel)).rejects.toThrow(
		"Membership lookup failed",
	);
});
