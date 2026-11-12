import { allowJoinRequest } from "~/lib/join-limits";
import { createMockRequest } from "~/test/helpers";
import { POST as joinBoard } from "../boards/[boardId]/join/route";
import { POST as joinPoker } from "../poker-sessions/[sessionId]/join/route";
import { POST as create } from "./create/route";

jest.mock("~/lib/join-limits", () => ({
	...jest.requireActual("~/lib/join-limits"),
	allowJoinRequest: jest.fn(),
}));
jest.mock("@clerk/nextjs/server");
jest.mock("next/headers");
jest.mock("~/lib/db");
it("refuses exhausted limits on creation and both joins", async () => {
	(allowJoinRequest as jest.Mock).mockResolvedValue(false);
	const request = createMockRequest("http://localhost");
	expect((await create(request)).status).toBe(429);
	expect(
		(
			await joinBoard(request, {
				params: Promise.resolve({ boardId: "board" }),
			})
		).status,
	).toBe(429);
	expect(
		(
			await joinPoker(request, {
				params: Promise.resolve({ sessionId: "session" }),
			})
		).status,
	).toBe(429);
});
it.each([
	false,
	5,
	"x".repeat(51),
	" ",
])("rejects invalid displayName (%#)", async (displayName) => {
	(allowJoinRequest as jest.Mock).mockResolvedValue(true);
	expect(
		(
			await create(
				createMockRequest("http://localhost", {
					method: "POST",
					body: { displayName },
				}),
			)
		).status,
	).toBe(400);
});
