import { createHmac } from "node:crypto";
import { db } from "~/lib/db";
import { flagEnabled } from "~/lib/flags";
import { createSprintRetro } from "~/lib/tracklines/retros";
import { seal } from "~/lib/tracklines/security";
import { POST } from "./route";

jest.mock("~/lib/flags", () => ({ flagEnabled: jest.fn() }));
jest.mock("~/lib/tracklines/retros", () => ({
	...jest.requireActual("~/lib/tracklines/retros"),
	createSprintRetro: jest.fn(),
}));
process.env.TRACKLINES_ENCRYPTION_KEY = "test-key";
const id = "11111111-1111-4111-8111-111111111111";
const event = {
	event: "sprint.started",
	data: { board_id: id, sprint: { id, number: 1 } },
};
const deliver = (body: object, signed = true) => {
	const text = JSON.stringify(body);
	const time = Math.floor(Date.now() / 1000);
	const signature = `t=${time},v1=${createHmac("sha256", "secret").update(`${time}.${text}`).digest("hex")}`;
	return POST(
		new Request("https://retro.test/hook", {
			method: "POST",
			body: text,
			headers: { "tracklines-signature": signed ? signature : "bad" },
		}),
		{ params: Promise.resolve({ connectionId: id }) },
	);
};
beforeEach(() => {
	jest.clearAllMocks();
	(flagEnabled as jest.Mock).mockResolvedValue(true);
	const chain = {
		select: jest.fn().mockReturnThis(),
		eq: jest.fn().mockReturnThis(),
		maybeSingle: jest.fn().mockResolvedValue({
			data: { id, user_id: "user", webhook_secret: seal("secret", id) },
		}),
	};
	(db.from as jest.Mock).mockReturnValue(chain);
});
test("creates a retro after signature and payload verification", async () => {
	expect((await deliver(event)).status).toBe(204);
	expect(createSprintRetro).toHaveBeenCalledWith(
		expect.objectContaining({ id, user_id: "user" }),
		event,
	);
});
test("refuses bad signatures and does not run disabled features", async () => {
	expect((await deliver(event, false)).status).toBe(401);
	(flagEnabled as jest.Mock).mockResolvedValue(false);
	expect((await deliver(event)).status).toBe(204);
	expect(createSprintRetro).not.toHaveBeenCalled();
});
test("unknown connections are refused and upstream failures ask TrackLin.es to retry", async () => {
	(db.from as jest.Mock)().maybeSingle.mockResolvedValueOnce({ data: null });
	expect((await deliver(event)).status).toBe(401);
	(createSprintRetro as jest.Mock).mockRejectedValueOnce(
		new Error("unavailable"),
	);
	expect((await deliver(event)).status).toBe(503);
});
