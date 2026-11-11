import { syncCustomer } from "./chewedfeed";

describe("syncCustomer", () => {
	const fetchMock = jest.fn(async () => ({ ok: true, status: 200 }));
	const saved = { ...process.env };
	beforeEach(() => {
		global.fetch = fetchMock as unknown as typeof fetch;
		process.env.CHEWEDFEED_API_URL = "https://hq.test/";
		process.env.CHEWEDFEED_ENQUIRY_KEY = "ek";
	});
	afterEach(() => {
		process.env = { ...saved };
		fetchMock.mockClear();
	});

	it("sends a free customer to the standard hook", async () => {
		await syncCustomer({ clerkId: "user_1", email: "a@b.c", name: "Ann" });
		const [url, init] = fetchMock.mock.calls[0] as unknown as [
			string,
			RequestInit,
		];
		expect(url).toBe("https://hq.test/api/product-customers/sync");
		expect((init.headers as Record<string, string>)["x-enquiry-key"]).toBe(
			"ek",
		);
		expect(JSON.parse(init.body as string)).toEqual({
			external_customer_id: "user_1",
			email: "a@b.c",
			name: "Ann",
			plan: "free",
		});
	});

	it("skips users without an email, and does nothing unconfigured", async () => {
		await syncCustomer({ clerkId: "user_1", email: "" });
		delete process.env.CHEWEDFEED_ENQUIRY_KEY;
		await syncCustomer({ clerkId: "user_2", email: "a@b.c" });
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
