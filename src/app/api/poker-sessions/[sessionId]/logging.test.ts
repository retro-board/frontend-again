import { cookies } from "next/headers";
import {
	createMockRequest,
	setupCookiesMock,
	setupDatabaseMocks,
	setupUnauthenticatedUser,
} from "~/test/helpers";
import { POST } from "./votes/route";

jest.mock("@clerk/nextjs/server");
jest.mock("next/headers");
jest.mock("~/lib/db");
it("never logs anonymous credentials or votes during failed identity lookup", async () => {
	setupUnauthenticatedUser();
	setupDatabaseMocks();
	(cookies as unknown as jest.Mock).mockResolvedValue(
		setupCookiesMock({ anonymous_session_id: "secret-cookie" }),
	);
	const log = jest.spyOn(console, "log").mockImplementation(() => {});
	const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
	try {
		expect(
			(
				await POST(
					createMockRequest("http://localhost", {
						method: "POST",
						body: { storyId: "story", vote: "8" },
					}),
					{ params: Promise.resolve({ sessionId: "session" }) },
				)
			).status,
		).toBe(404);
		expect(log).not.toHaveBeenCalled();
		expect(warn).not.toHaveBeenCalled();
	} finally {
		log.mockRestore();
		warn.mockRestore();
	}
});
