import { currentUser } from "@clerk/nextjs/server";
import { syncCustomer } from "~/lib/chewedfeed";
import {
	createMockRequest,
	mockClerkUser,
	setupAuthenticatedUser,
	setupDatabaseMocks,
} from "~/test/helpers";
import { POST } from "./route";

jest.mock("@clerk/nextjs/server");
jest.mock("~/lib/db");
jest.mock("~/lib/chewedfeed", () => ({ syncCustomer: jest.fn() }));
beforeEach(() => {
	jest.clearAllMocks();
	setupAuthenticatedUser();
});
it.each([
	false,
	true,
])("ignores spoofed profile fields (existing: %s)", async (existing) => {
	const mocks = setupDatabaseMocks();
	mocks.maybeSingleMock.mockResolvedValue({
		data: existing ? { id: "user" } : null,
		error: null,
	});
	mocks.singleMock.mockResolvedValue({ data: { id: "user" }, error: null });
	const response = await POST(
		createMockRequest("http://localhost", {
			method: "POST",
			body: {
				email: "victim@example.com",
				name: "Imposter",
				avatar_url: "https://malicious.invalid",
			},
		}),
	);
	expect(response.status).toBe(200);
	expect(existing ? mocks.updateMock : mocks.insertMock).toHaveBeenCalledWith(
		expect.objectContaining({
			email: mockClerkUser.emailAddresses[0]?.emailAddress,
			name: mockClerkUser.fullName,
			avatar_url: mockClerkUser.imageUrl,
		}),
	);
	if (!existing)
		expect(syncCustomer).toHaveBeenCalledWith(
			expect.objectContaining({
				email: mockClerkUser.emailAddresses[0]?.emailAddress,
			}),
		);
});
it("refuses missing server-side profiles", async () => {
	const mocks = setupDatabaseMocks();
	(currentUser as jest.Mock).mockResolvedValue(null);
	expect((await POST(createMockRequest("http://localhost"))).status).toBe(401);
	expect(mocks.insertMock).not.toHaveBeenCalled();
});
