import { auth } from "@clerk/nextjs/server";
import { db } from "~/lib/db";
import { PATCH } from "./route";

jest.mock("@clerk/nextjs/server", () => ({ auth: jest.fn() }));
jest.mock("next/headers", () => ({ cookies: jest.fn() }));
jest.mock("~/lib/db", () => ({ db: { from: jest.fn() } }));
jest.mock("next/server", () => ({
	NextResponse: { json: jest.fn((data, init) => ({ data, init })) },
}));

describe("PATCH /api/poker-sessions/[sessionId] result_method (RB-4)", () => {
	const mockAuth = auth as unknown as jest.Mock;
	const mockFrom = db.from as jest.Mock;
	const params = { params: Promise.resolve({ sessionId: "session-1" }) };
	const patch = (body: object) =>
		PATCH(
			new Request("http://localhost", {
				method: "PATCH",
				body: JSON.stringify(body),
			}),
			params,
		);

	// user lookup, then the facilitator check returning the given row
	const mockUser = (facilitator: object | null) => {
		mockFrom.mockReset();
		mockAuth.mockResolvedValue({ userId: "clerk-1" });
		mockFrom.mockReturnValueOnce({
			select: jest.fn().mockReturnValue({
				eq: jest.fn().mockReturnValue({
					maybeSingle: jest.fn().mockResolvedValue({ data: { id: "user-1" } }),
				}),
			}),
		});
		mockFrom.mockReturnValueOnce({
			select: jest.fn().mockReturnValue({
				eq: jest.fn().mockReturnValue({
					eq: jest.fn().mockReturnValue({
						eq: jest.fn().mockReturnValue({
							maybeSingle: jest.fn().mockResolvedValue({ data: facilitator }),
						}),
					}),
				}),
			}),
		});
	};

	it("rejects an unknown method", async () => {
		mockUser({ role: "facilitator" });
		expect(await patch({ result_method: "median" })).toEqual({
			data: { error: "Invalid result method" },
			init: { status: 400 },
		});
	});

	it("only lets the facilitator change it", async () => {
		mockUser(null);
		expect(await patch({ result_method: "mode" })).toEqual({
			data: { error: "Only facilitators can modify sessions" },
			init: { status: 403 },
		});
	});

	it("saves it for the facilitator", async () => {
		mockUser({ role: "facilitator" });
		const update = jest.fn().mockReturnValue({
			eq: jest.fn().mockReturnValue({
				select: jest.fn().mockReturnValue({
					single: jest.fn().mockResolvedValue({
						data: { result_method: "mode" },
						error: null,
					}),
				}),
			}),
		});
		mockFrom.mockReturnValueOnce({ update });
		await patch({ result_method: "mode" });
		expect(update).toHaveBeenCalledWith({ result_method: "mode" });
	});
});
