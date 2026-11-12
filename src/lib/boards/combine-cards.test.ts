import { getPool } from "~/lib/db";
import { combineCards } from "./combine-cards";

jest.mock("~/lib/db", () => ({ getPool: jest.fn() }));
const query = jest.fn();
const release = jest.fn();
beforeEach(() => {
	jest.clearAllMocks();
	(getPool as jest.Mock).mockReturnValue({
		connect: async () => ({ query, release }),
	});
	query.mockResolvedValue({ rows: [] });
});
it("rejects foreign targets before any database mutation", async () => {
	expect(await combineCards("board", "owner", ["source"], "foreign")).toEqual({
		status: 400,
		error: "Target must be one of the source cards",
	});
	expect(getPool).not.toHaveBeenCalled();
});
it("rolls back the target update if deletion fails", async () => {
	query
		.mockResolvedValueOnce({})
		.mockResolvedValueOnce({ rows: [{ owner_id: "owner", phase: "reveal" }] })
		.mockResolvedValueOnce({ rows: [{ id: "source", content: "text" }] })
		.mockResolvedValueOnce({})
		.mockRejectedValueOnce(new Error("delete failed"));
	await expect(
		combineCards("board", "owner", ["source"], "source"),
	).rejects.toThrow("delete failed");
	expect(query).toHaveBeenLastCalledWith("ROLLBACK");
	expect(query.mock.calls.some(([sql]) => sql === "COMMIT")).toBe(false);
	expect(release).toHaveBeenCalled();
});
it("rejects source cards outside the board", async () => {
	query
		.mockResolvedValueOnce({})
		.mockResolvedValueOnce({ rows: [{ owner_id: "owner", phase: "reveal" }] })
		.mockResolvedValueOnce({ rows: [] });
	expect(
		(await combineCards("board", "owner", ["foreign"], "foreign")).status,
	).toBe(404);
	expect(query.mock.calls.some(([sql]) => sql.startsWith("UPDATE cards"))).toBe(
		false,
	);
});
