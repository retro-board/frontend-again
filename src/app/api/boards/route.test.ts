import { currentUser } from "@clerk/nextjs/server";
import {
	createMockRequest,
	mockBoard,
	mockClerkUser,
	mockDbUser,
	setupAuthenticatedUser,
	setupSupabaseMocks,
	setupUnauthenticatedUser,
} from "~/test/helpers";
import { POST } from "./route";

// Mock dependencies
jest.mock("@clerk/nextjs/server");
jest.mock("~/lib/supabase/admin");
jest.mock("~/lib/supabase/server");

describe("/api/boards POST", () => {
	let supabaseMocks: ReturnType<typeof setupSupabaseMocks>;

	beforeEach(() => {
		jest.clearAllMocks();
		supabaseMocks = setupSupabaseMocks();
	});

	it("should create a board for an existing user", async () => {
		setupAuthenticatedUser();

		// Mock user exists in database
		supabaseMocks.maybeSingleMock.mockResolvedValueOnce({
			data: mockDbUser,
			error: null,
		});

		// Mock board creation
		supabaseMocks.singleMock.mockResolvedValueOnce({
			data: mockBoard,
			error: null,
		});

		// Mock participant insertion
		supabaseMocks.insertMock.mockResolvedValueOnce({
			data: null,
			error: null,
		});

		const request = createMockRequest("http://localhost:3000/api/boards", {
			method: "POST",
			body: {
				name: "Test Board",
				description: "Test Description",
			},
		});

		const response = await POST(request);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.board).toEqual(mockBoard);
		expect(supabaseMocks.fromMock).toHaveBeenCalledWith("users");
		expect(supabaseMocks.fromMock).toHaveBeenCalledWith("boards");
		expect(supabaseMocks.fromMock).toHaveBeenCalledWith("board_participants");
	});

	it("should automatically sync user from Clerk if not in database", async () => {
		setupAuthenticatedUser();

		// Mock user doesn't exist in database
		supabaseMocks.maybeSingleMock.mockResolvedValueOnce({
			data: null,
			error: null,
		});

		// Mock user creation
		supabaseMocks.singleMock.mockResolvedValueOnce({
			data: mockDbUser,
			error: null,
		});

		// Mock board creation
		supabaseMocks.singleMock.mockResolvedValueOnce({
			data: mockBoard,
			error: null,
		});

		const request = createMockRequest("http://localhost:3000/api/boards", {
			method: "POST",
			body: {
				name: "Test Board",
				description: "Test Description",
			},
		});

		const response = await POST(request);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.board).toEqual(mockBoard);
		expect(currentUser).toHaveBeenCalled();
		expect(supabaseMocks.insertMock).toHaveBeenCalledWith(
			expect.objectContaining({
				clerk_id: mockClerkUser.id,
				email: mockClerkUser.emailAddresses[0]?.emailAddress,
				name: mockClerkUser.fullName,
				avatar_url: mockClerkUser.imageUrl,
			}),
		);
	});

	it("should return 401 if user is not authenticated", async () => {
		setupUnauthenticatedUser();

		const request = createMockRequest("http://localhost:3000/api/boards", {
			method: "POST",
			body: {
				name: "Test Board",
				description: "Test Description",
			},
		});

		const response = await POST(request);
		const data = await response.json();

		expect(response.status).toBe(401);
		expect(data.error).toBe("Unauthorized");
		expect(supabaseMocks.fromMock).not.toHaveBeenCalled();
	});

	it("should return 500 if user sync fails", async () => {
		setupAuthenticatedUser();

		// Mock user doesn't exist in database
		supabaseMocks.maybeSingleMock.mockResolvedValueOnce({
			data: null,
			error: null,
		});

		// Mock user creation fails
		supabaseMocks.singleMock.mockResolvedValueOnce({
			data: null,
			error: { message: "Database error" },
		});

		const request = createMockRequest("http://localhost:3000/api/boards", {
			method: "POST",
			body: {
				name: "Test Board",
				description: "Test Description",
			},
		});

		const response = await POST(request);
		const data = await response.json();

		expect(response.status).toBe(500);
		expect(data.error).toBe("Failed to sync user to database");
	});
});
