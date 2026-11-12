import { getRedis } from "~/lib/realtime/server";
import { allowJoinRequest, anonymousDisplayName } from "./join-limits";

jest.mock("~/lib/realtime/server", () => ({ getRedis: jest.fn() }));
it("caps creation and joins by address using shared Redis counters", async () => {
	let count = 0;
	const evalMock = jest.fn(async (..._args: unknown[]) => ++count);
	(getRedis as jest.Mock).mockReturnValue({ eval: evalMock });
	const request = new Request("http://localhost", {
		headers: { "x-forwarded-for": "fake, 192.0.2.1" },
	});
	for (let i = 0; i < 10; i++)
		expect(await allowJoinRequest(request, "create")).toBe(true);
	expect(await allowJoinRequest(request, "create")).toBe(false);
	count = 30;
	expect(await allowJoinRequest(request, "join")).toBe(false);
	expect(evalMock.mock.calls[0]?.[2]).not.toContain("192.0.2.1");
});
it.each([
	null,
	12,
	{},
	"",
	" ",
	"x".repeat(51),
])("rejects invalid names (%#)", (value) => {
	expect(anonymousDisplayName(value)).toBeNull();
});
it("trims valid names", () => {
	expect(anonymousDisplayName(" Guest ")).toBe("Guest");
});
