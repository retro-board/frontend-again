import { flagEnabled } from "./flags";

jest.mock("~/env", () => ({
	flagConfig: { projectId: "p", agentId: "a", environmentId: "e" },
}));

const answer = (body: unknown, status = 200) =>
	(global.fetch as jest.Mock).mockResolvedValue({
		ok: status < 300,
		json: async () => body,
	});

describe("flagEnabled", () => {
	it("is on only when flags.gg says that flag is enabled", async () => {
		answer({ flags: [{ enabled: true, details: { name: "settings" } }] });
		expect(await flagEnabled("settings")).toBe(true);
		expect(await flagEnabled("other")).toBe(false);
		answer({ flags: [{ enabled: false, details: { name: "settings" } }] });
		expect(await flagEnabled("settings")).toBe(false);
	});

	it("sends the project, agent and environment ids", async () => {
		answer({ flags: [] });
		await flagEnabled("settings");
		expect(global.fetch).toHaveBeenCalledWith(
			"https://api.flags.gg/flags",
			expect.objectContaining({
				headers: {
					"x-project-id": "p",
					"x-agent-id": "a",
					"x-environment-id": "e",
				},
			}),
		);
	});

	it("counts any failure as off", async () => {
		answer({}, 500);
		expect(await flagEnabled("settings")).toBe(false);
		answer(null);
		expect(await flagEnabled("settings")).toBe(false);
		(global.fetch as jest.Mock).mockRejectedValue(new Error("down"));
		expect(await flagEnabled("settings")).toBe(false);
	});
});
