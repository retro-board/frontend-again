import { authorizeChannel } from "~/lib/realtime/authorize";
import {
	actionItemsEnabled,
	retroActionItems,
	syncRetroActions,
} from "~/lib/tracklines/actions";
import { GET, POST } from "./route";

jest.mock("~/lib/realtime/authorize");
jest.mock("~/lib/tracklines/actions");
const context = { params: Promise.resolve({ boardId: "retro" }) };
const request = new Request("http://localhost");
beforeEach(() => {
	jest.clearAllMocks();
	(actionItemsEnabled as jest.Mock).mockResolvedValue(true);
	(retroActionItems as jest.Mock).mockResolvedValue({
		linked: true,
		completed: true,
		actions: [],
	});
});
it("requires membership to read status", async () => {
	(authorizeChannel as jest.Mock).mockResolvedValue(null);
	expect((await GET(request, context)).status).toBe(403);
	expect(retroActionItems).not.toHaveBeenCalled();
});
it.each([
	{ role: "participant", anonymous: false },
	{ role: "owner", anonymous: true },
	null,
])("refuses non-owner sends (%#)", async (identity) => {
	(authorizeChannel as jest.Mock).mockResolvedValue(identity);
	expect((await POST(request, context)).status).toBe(403);
	expect(syncRetroActions).not.toHaveBeenCalled();
});
it("allows the owner to send existing actions", async () => {
	(authorizeChannel as jest.Mock).mockResolvedValue({
		role: "owner",
		anonymous: false,
	});
	expect((await POST(request, context)).status).toBe(200);
	expect(syncRetroActions).toHaveBeenCalledWith("retro");
});
it("does not expose the feature when disabled", async () => {
	(actionItemsEnabled as jest.Mock).mockResolvedValue(false);
	expect((await POST(request, context)).status).toBe(404);
	expect(syncRetroActions).not.toHaveBeenCalled();
});

it("rejects owner retries before completion", async () => {
	(authorizeChannel as jest.Mock).mockResolvedValue({
		role: "owner",
		anonymous: false,
	});
	(retroActionItems as jest.Mock).mockResolvedValue({
		linked: true,
		completed: false,
		actions: [],
	});
	expect((await POST(request, context)).status).toBe(409);
	expect(syncRetroActions).not.toHaveBeenCalled();
});
