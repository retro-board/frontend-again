import { currentUser } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import {
	createMockRequest,
	mockAnonymousUser,
	mockBoard,
	mockClerkUser,
	mockDbUser,
	setupAuthenticatedUser,
	setupCookiesMock,
	setupDatabaseMocks,
	setupUnauthenticatedUser,
} from "~/test/helpers";
import { GET } from "./route";

// Mock dependencies
jest.mock("@clerk/nextjs/server");
jest.mock("~/lib/db");
jest.mock("next/headers");

describe("/api/boards/[boardId] GET", () => {
	let databaseMocks: ReturnType<typeof setupDatabaseMocks>;
	let cookieStoreMock: ReturnType<typeof setupCookiesMock>;

	beforeEach(() => {
		jest.clearAllMocks();
		databaseMocks = setupDatabaseMocks();
		cookieStoreMock = setupCookiesMock();
		(cookies as unknown as jest.Mock).mockResolvedValue(cookieStoreMock);
	});

	describe("User auto-sync", () => {
		it("should automatically create user if not in database", async () => {
			setupAuthenticatedUser();

			// Mock user doesn't exist
			databaseMocks.maybeSingleMock.mockResolvedValueOnce({
				data: null,
				error: null,
			});

			// Mock user creation
			databaseMocks.singleMock.mockResolvedValueOnce({
				data: mockDbUser,
				error: null,
			});

			// Mock user is participant
			databaseMocks.maybeSingleMock.mockResolvedValueOnce({
				data: { id: "participant_123" },
				error: null,
			});

			// Mock board fetch
			databaseMocks.singleMock.mockResolvedValueOnce({
				data: mockBoard,
				error: null,
			});

			// Mock columns fetch - columns are returned as an array
			const mockColumns = [
				{
					id: "col_1",
					name: "Column 1",
					cards: [],
				},
			];
			// The columns query doesn't use maybeSingle/single, it returns array directly
			// We need to mock the entire chain to return the data
			databaseMocks.orderMock.mockResolvedValueOnce({
				data: mockColumns,
				error: null,
			});

			const request = createMockRequest(
				"http://localhost:3000/api/boards/board_123",
			);

			const response = await GET(request, {
				params: Promise.resolve({ boardId: "board_123" }),
			});
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

		it("should work with existing users", async () => {
			setupAuthenticatedUser();

			// Mock user exists
			databaseMocks.maybeSingleMock.mockResolvedValueOnce({
				data: mockDbUser,
				error: null,
			});

			// Mock user is participant
			databaseMocks.maybeSingleMock.mockResolvedValueOnce({
				data: { id: "participant_123" },
				error: null,
			});

			// Mock board fetch
			databaseMocks.singleMock.mockResolvedValueOnce({
				data: mockBoard,
				error: null,
			});

			// Mock columns fetch - columns are returned as an array
			const mockColumns = [
				{
					id: "col_1",
					name: "Column 1",
					cards: [],
				},
			];
			// The columns query doesn't use maybeSingle/single, it returns array directly
			// We need to mock the entire chain to return the data
			databaseMocks.orderMock.mockResolvedValueOnce({
				data: mockColumns,
				error: null,
			});

			const request = createMockRequest(
				"http://localhost:3000/api/boards/board_123",
			);

			const response = await GET(request, {
				params: Promise.resolve({ boardId: "board_123" }),
			});
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.board).toEqual(mockBoard);
			expect(currentUser).not.toHaveBeenCalled(); // No need to sync
		});
	});

	describe("Authorization", () => {
		it("should deny access if user is not a participant", async () => {
			setupAuthenticatedUser();

			// Mock user exists
			databaseMocks.maybeSingleMock.mockResolvedValueOnce({
				data: mockDbUser,
				error: null,
			});

			// Mock user is NOT participant
			databaseMocks.maybeSingleMock.mockResolvedValueOnce({
				data: null,
				error: null,
			});

			const request = createMockRequest(
				"http://localhost:3000/api/boards/board_123",
			);

			const response = await GET(request, {
				params: Promise.resolve({ boardId: "board_123" }),
			});
			const data = await response.json();

			expect(response.status).toBe(403);
			expect(data.error).toBe("Not authorized to view this board");
		});

		it("should allow anonymous users who are participants", async () => {
			setupUnauthenticatedUser();
			cookieStoreMock = setupCookiesMock({
				anonymous_session_id: "anon_session_123",
			});
			(cookies as unknown as jest.Mock).mockResolvedValue(cookieStoreMock);

			// Mock anonymous user exists
			databaseMocks.maybeSingleMock.mockResolvedValueOnce({
				data: mockAnonymousUser,
				error: null,
			});

			// Mock anonymous user is participant
			databaseMocks.maybeSingleMock.mockResolvedValueOnce({
				data: { id: "anon_participant_123" },
				error: null,
			});

			// Mock board fetch
			databaseMocks.singleMock.mockResolvedValueOnce({
				data: mockBoard,
				error: null,
			});

			// Mock columns fetch - columns are returned as an array
			const mockColumns = [
				{
					id: "col_1",
					name: "Column 1",
					cards: [],
				},
			];
			// The columns query doesn't use maybeSingle/single, it returns array directly
			// We need to mock the entire chain to return the data
			databaseMocks.orderMock.mockResolvedValueOnce({
				data: mockColumns,
				error: null,
			});

			const request = createMockRequest(
				"http://localhost:3000/api/boards/board_123",
			);

			const response = await GET(request, {
				params: Promise.resolve({ boardId: "board_123" }),
			});
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.board).toEqual(mockBoard);
			expect(databaseMocks.fromMock).toHaveBeenCalledWith(
				"board_anonymous_participants",
			);
		});
	});

	describe("Error handling", () => {
		it("should return 401 if not authenticated and no anonymous session", async () => {
			setupUnauthenticatedUser();
			cookieStoreMock = setupCookiesMock({});
			(cookies as unknown as jest.Mock).mockResolvedValue(cookieStoreMock);

			const request = createMockRequest(
				"http://localhost:3000/api/boards/board_123",
			);

			const response = await GET(request, {
				params: Promise.resolve({ boardId: "board_123" }),
			});
			const data = await response.json();

			expect(response.status).toBe(401);
			expect(data.error).toBe("Unauthorized");
		});

		it("should return 404 if board not found", async () => {
			setupAuthenticatedUser();

			// Mock user exists
			databaseMocks.maybeSingleMock.mockResolvedValueOnce({
				data: mockDbUser,
				error: null,
			});

			// Mock user is participant
			databaseMocks.maybeSingleMock.mockResolvedValueOnce({
				data: { id: "participant_123" },
				error: null,
			});

			// Mock board not found
			databaseMocks.singleMock.mockResolvedValueOnce({
				data: null,
				error: null,
			});

			const request = createMockRequest(
				"http://localhost:3000/api/boards/board_123",
			);

			const response = await GET(request, {
				params: Promise.resolve({ boardId: "board_123" }),
			});
			const data = await response.json();

			expect(response.status).toBe(404);
			expect(data.error).toBe("Board not found");
		});

		it("should return 404 if user sync fails completely", async () => {
			setupAuthenticatedUser();

			// Mock user doesn't exist
			databaseMocks.maybeSingleMock.mockResolvedValueOnce({
				data: null,
				error: null,
			});

			// Mock currentUser returns null (shouldn't happen but edge case)
			(currentUser as unknown as jest.Mock).mockResolvedValueOnce(null);

			const request = createMockRequest(
				"http://localhost:3000/api/boards/board_123",
			);

			const response = await GET(request, {
				params: Promise.resolve({ boardId: "board_123" }),
			});
			const data = await response.json();

			expect(response.status).toBe(404);
			expect(data.error).toBe("User not found");
		});
	});
});
