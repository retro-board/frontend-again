import { currentUser } from "@clerk/nextjs/server";
import {
	createMockRequest,
	mockBoard,
	mockClerkUser,
	mockDbUser,
	setupAuthenticatedUser,
	setupDatabaseMocks,
	setupUnauthenticatedUser,
} from "~/test/helpers";
import { POST } from "./route";

// Mock dependencies
jest.mock("@clerk/nextjs/server");
jest.mock("~/lib/db");

describe("/api/boards POST", () => {
	let databaseMocks: ReturnType<typeof setupDatabaseMocks>;

	beforeEach(() => {
		jest.clearAllMocks();
		databaseMocks = setupDatabaseMocks();
	});

	it("should create a board for an existing user", async () => {
		setupAuthenticatedUser();

		// Mock user exists in database
		databaseMocks.maybeSingleMock.mockResolvedValueOnce({
			data: mockDbUser,
			error: null,
		});

		// Mock board creation - single() is called after insert().select()
		databaseMocks.singleMock.mockResolvedValueOnce({
			data: mockBoard,
			error: null,
		});

		// Don't override insertMock as it needs to return the chain
		// The insert for board_participants doesn't return data, it's just inserted

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
		expect(databaseMocks.fromMock).toHaveBeenCalledWith("users");
		expect(databaseMocks.fromMock).toHaveBeenCalledWith("boards");
		expect(databaseMocks.fromMock).toHaveBeenCalledWith("board_participants");
	});

	it("should automatically sync user from Clerk if not in database", async () => {
		setupAuthenticatedUser();

		// Mock user doesn't exist in database
		databaseMocks.maybeSingleMock.mockResolvedValueOnce({
			data: null,
			error: null,
		});

		// Mock user creation
		databaseMocks.singleMock.mockResolvedValueOnce({
			data: mockDbUser,
			error: null,
		});

		// Mock board creation
		databaseMocks.singleMock.mockResolvedValueOnce({
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
		expect(databaseMocks.insertMock).toHaveBeenCalledWith(
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
		expect(databaseMocks.fromMock).not.toHaveBeenCalled();
	});

	it("should return 500 if user sync fails", async () => {
		setupAuthenticatedUser();

		// Mock user doesn't exist in database
		databaseMocks.maybeSingleMock.mockResolvedValueOnce({
			data: null,
			error: null,
		});

		// Mock user creation fails
		databaseMocks.singleMock.mockResolvedValueOnce({
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
