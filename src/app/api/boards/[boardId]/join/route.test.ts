import { auth, currentUser } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "~/lib/supabase/admin";
import {
	createMockRequest,
	mockAnonymousUser,
	mockBoard,
	mockBoardInSetup,
	mockClerkUser,
	mockDbUser,
	setupAuthenticatedUser,
	setupCookiesMock,
	setupSupabaseMocks,
	setupUnauthenticatedUser,
} from "~/test/helpers";
import { POST } from "./route";

// Mock dependencies
jest.mock("@clerk/nextjs/server");
jest.mock("~/lib/supabase/admin");
jest.mock("next/headers");

describe("/api/boards/[boardId]/join POST", () => {
	let supabaseMocks: ReturnType<typeof setupSupabaseMocks>;
	let cookieStoreMock: ReturnType<typeof setupCookiesMock>;

	beforeEach(() => {
		jest.clearAllMocks();
		supabaseMocks = setupSupabaseMocks();
		cookieStoreMock = setupCookiesMock();
		(cookies as unknown as jest.Mock).mockResolvedValue(cookieStoreMock);
	});

	describe("Setup phase restrictions", () => {
		it("should block anonymous users from joining during setup phase", async () => {
			setupUnauthenticatedUser();
			cookieStoreMock = setupCookiesMock({
				anonymous_session_id: "anon_session_123",
			});
			(cookies as unknown as jest.Mock).mockResolvedValue(cookieStoreMock);

			// Mock board in setup phase
			supabaseMocks.maybeSingleMock.mockResolvedValueOnce({
				data: mockBoardInSetup,
				error: null,
			});

			const request = createMockRequest(
				"http://localhost:3000/api/boards/board_123/join",
				{
					method: "POST",
				},
			);

			const response = await POST(request, {
				params: Promise.resolve({ boardId: "board_123" }),
			});
			const data = await response.json();

			expect(response.status).toBe(403);
			expect(data.error).toContain("Board is still being set up");
		});

		it("should block non-owner users from joining during setup phase", async () => {
			setupAuthenticatedUser("different_user_123");

			// Mock board in setup phase
			supabaseMocks.maybeSingleMock.mockResolvedValueOnce({
				data: mockBoardInSetup,
				error: null,
			});

			// Mock user exists but is not the owner
			supabaseMocks.maybeSingleMock.mockResolvedValueOnce({
				data: { id: "different_db_user_123" },
				error: null,
			});

			const request = createMockRequest(
				"http://localhost:3000/api/boards/board_123/join",
				{
					method: "POST",
				},
			);

			const response = await POST(request, {
				params: Promise.resolve({ boardId: "board_123" }),
			});
			const data = await response.json();

			expect(response.status).toBe(403);
			expect(data.error).toContain("Board is still being set up");
		});

		it("should allow owner to join during setup phase", async () => {
			setupAuthenticatedUser();

			// Mock board in setup phase
			supabaseMocks.maybeSingleMock.mockResolvedValueOnce({
				data: mockBoardInSetup,
				error: null,
			});

			// Mock user is the owner
			supabaseMocks.maybeSingleMock.mockResolvedValueOnce({
				data: mockDbUser,
				error: null,
			});

			// Mock checking existing participant
			supabaseMocks.maybeSingleMock.mockResolvedValueOnce({
				data: null,
				error: null,
			});

			// Mock adding participant
			supabaseMocks.insertMock.mockResolvedValueOnce({
				data: null,
				error: null,
			});

			const request = createMockRequest(
				"http://localhost:3000/api/boards/board_123/join",
				{
					method: "POST",
				},
			);

			const response = await POST(request, {
				params: Promise.resolve({ boardId: "board_123" }),
			});
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
		});
	});

	describe("Normal board joining", () => {
		it("should allow authenticated users to join active boards", async () => {
			setupAuthenticatedUser();

			// Mock board in creation phase
			supabaseMocks.maybeSingleMock.mockResolvedValueOnce({
				data: mockBoard,
				error: null,
			});

			// Mock user exists
			supabaseMocks.maybeSingleMock.mockResolvedValueOnce({
				data: mockDbUser,
				error: null,
			});

			// Mock checking existing participant
			supabaseMocks.maybeSingleMock.mockResolvedValueOnce({
				data: null,
				error: null,
			});

			// Mock adding participant
			supabaseMocks.insertMock.mockResolvedValueOnce({
				data: null,
				error: null,
			});

			const request = createMockRequest(
				"http://localhost:3000/api/boards/board_123/join",
				{
					method: "POST",
				},
			);

			const response = await POST(request, {
				params: Promise.resolve({ boardId: "board_123" }),
			});
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
			expect(supabaseMocks.fromMock).toHaveBeenCalledWith("board_participants");
		});

		it("should automatically sync user if not in database", async () => {
			setupAuthenticatedUser();

			// Mock board in creation phase
			supabaseMocks.maybeSingleMock.mockResolvedValueOnce({
				data: mockBoard,
				error: null,
			});

			// Mock user doesn't exist
			supabaseMocks.maybeSingleMock.mockResolvedValueOnce({
				data: null,
				error: null,
			});

			// Mock user creation
			supabaseMocks.singleMock.mockResolvedValueOnce({
				data: mockDbUser,
				error: null,
			});

			// Mock checking existing participant
			supabaseMocks.maybeSingleMock.mockResolvedValueOnce({
				data: null,
				error: null,
			});

			// Mock adding participant
			supabaseMocks.insertMock.mockResolvedValueOnce({
				data: null,
				error: null,
			});

			const request = createMockRequest(
				"http://localhost:3000/api/boards/board_123/join",
				{
					method: "POST",
				},
			);

			const response = await POST(request, {
				params: Promise.resolve({ boardId: "board_123" }),
			});
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
			expect(currentUser).toHaveBeenCalled();
			expect(supabaseMocks.insertMock).toHaveBeenCalledWith(
				expect.objectContaining({
					clerk_id: mockClerkUser.id,
				}),
			);
		});

		it("should allow anonymous users to join active boards", async () => {
			setupUnauthenticatedUser();
			cookieStoreMock = setupCookiesMock({
				anonymous_session_id: "anon_session_123",
			});
			(cookies as unknown as jest.Mock).mockResolvedValue(cookieStoreMock);

			// Mock board in creation phase
			supabaseMocks.maybeSingleMock.mockResolvedValueOnce({
				data: mockBoard,
				error: null,
			});

			// Mock anonymous user exists
			supabaseMocks.maybeSingleMock.mockResolvedValueOnce({
				data: mockAnonymousUser,
				error: null,
			});

			// Mock checking existing participant
			supabaseMocks.maybeSingleMock.mockResolvedValueOnce({
				data: null,
				error: null,
			});

			// Mock adding participant
			supabaseMocks.insertMock.mockResolvedValueOnce({
				data: null,
				error: null,
			});

			const request = createMockRequest(
				"http://localhost:3000/api/boards/board_123/join",
				{
					method: "POST",
				},
			);

			const response = await POST(request, {
				params: Promise.resolve({ boardId: "board_123" }),
			});
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
			expect(supabaseMocks.fromMock).toHaveBeenCalledWith(
				"board_anonymous_participants",
			);
		});
	});

	describe("Error handling", () => {
		it("should return 404 if board not found", async () => {
			setupAuthenticatedUser();

			// Mock board not found
			supabaseMocks.maybeSingleMock.mockResolvedValueOnce({
				data: null,
				error: null,
			});

			const request = createMockRequest(
				"http://localhost:3000/api/boards/board_123/join",
				{
					method: "POST",
				},
			);

			const response = await POST(request, {
				params: Promise.resolve({ boardId: "board_123" }),
			});
			const data = await response.json();

			expect(response.status).toBe(404);
			expect(data.error).toBe("Board not found or inactive");
		});

		it("should return 401 if not authenticated and no anonymous session", async () => {
			setupUnauthenticatedUser();
			cookieStoreMock = setupCookiesMock({});
			(cookies as unknown as jest.Mock).mockResolvedValue(cookieStoreMock);

			const request = createMockRequest(
				"http://localhost:3000/api/boards/board_123/join",
				{
					method: "POST",
				},
			);

			const response = await POST(request, {
				params: Promise.resolve({ boardId: "board_123" }),
			});
			const data = await response.json();

			expect(response.status).toBe(401);
			expect(data.error).toBe("Authentication required");
		});
	});
});
