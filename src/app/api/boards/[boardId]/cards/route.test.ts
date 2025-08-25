import { currentUser } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import {
	createMockRequest,
	mockBoard,
	mockBoardInSetup,
	mockClerkUser,
	mockDbUser,
	setupAuthenticatedUser,
	setupCookiesMock,
	setupSupabaseMocks,
} from "~/test/helpers";
import { POST } from "./route";

// Mock dependencies
jest.mock("@clerk/nextjs/server");
jest.mock("~/lib/supabase/admin");
jest.mock("next/headers");

describe("/api/boards/[boardId]/cards POST", () => {
	let supabaseMocks: ReturnType<typeof setupSupabaseMocks>;
	let cookieStoreMock: ReturnType<typeof setupCookiesMock>;

	beforeEach(() => {
		jest.clearAllMocks();
		supabaseMocks = setupSupabaseMocks();
		cookieStoreMock = setupCookiesMock();
		(cookies as unknown as jest.Mock).mockResolvedValue(cookieStoreMock);
	});

	describe("Setup phase restrictions", () => {
		it("should block adding cards to non-action columns during setup phase", async () => {
			setupAuthenticatedUser();

			// Mock user exists
			supabaseMocks.maybeSingleMock.mockResolvedValueOnce({
				data: mockDbUser,
				error: null,
			});

			// Mock user is participant (owner)
			supabaseMocks.maybeSingleMock.mockResolvedValueOnce({
				data: { id: "participant_123", role: "owner" },
				error: null,
			});

			// Mock column fetch - regular column (not action) with board in setup
			const mockColumn = {
				id: "column_123",
				name: "What went well",
				is_action: false,
				board: mockBoardInSetup,
			};
			supabaseMocks.singleMock.mockResolvedValueOnce({
				data: mockColumn,
				error: null,
			});

			const request = createMockRequest(
				"http://localhost:3000/api/boards/board_123/cards",
				{
					method: "POST",
					body: {
						column_id: "column_123",
						content: "Test card",
						position: 0,
					},
				},
			);

			const response = await POST(request, {
				params: Promise.resolve({ boardId: "board_123" }),
			});
			const data = await response.json();

			expect(response.status).toBe(403);
			expect(data.error).toBe(
				"During setup phase, only the owner can add action items",
			);
		});

		it("should allow adding cards to action columns during setup phase", async () => {
			setupAuthenticatedUser();

			// Mock user exists
			supabaseMocks.maybeSingleMock.mockResolvedValueOnce({
				data: mockDbUser,
				error: null,
			});

			// Mock user is participant (owner)
			supabaseMocks.maybeSingleMock.mockResolvedValueOnce({
				data: { id: "participant_123", role: "owner" },
				error: null,
			});

			// Mock column fetch - action column with board in setup
			const mockActionColumn = {
				id: "column_action_123",
				name: "Action Items",
				is_action: true,
				board: mockBoardInSetup,
			};
			supabaseMocks.singleMock.mockResolvedValueOnce({
				data: mockActionColumn,
				error: null,
			});

			// Mock card creation
			supabaseMocks.singleMock.mockResolvedValueOnce({
				data: { id: "card_123", content: "Test action item" },
				error: null,
			});

			const request = createMockRequest(
				"http://localhost:3000/api/boards/board_123/cards",
				{
					method: "POST",
					body: {
						column_id: "column_action_123",
						content: "Test action item",
						position: 0,
					},
				},
			);

			const response = await POST(request, {
				params: Promise.resolve({ boardId: "board_123" }),
			});
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.card).toBeDefined();
		});
	});

	describe("Normal phase behavior", () => {
		it("should allow adding cards to any column after setup phase", async () => {
			setupAuthenticatedUser();

			// Mock user exists
			supabaseMocks.maybeSingleMock.mockResolvedValueOnce({
				data: mockDbUser,
				error: null,
			});

			// Mock user is participant
			supabaseMocks.maybeSingleMock.mockResolvedValueOnce({
				data: { id: "participant_123", role: "participant" },
				error: null,
			});

			// Mock column fetch - regular column with board in creation phase
			const mockColumn = {
				id: "column_123",
				name: "What went well",
				is_action: false,
				board: mockBoard, // This is in creation phase
			};
			supabaseMocks.singleMock.mockResolvedValueOnce({
				data: mockColumn,
				error: null,
			});

			// Mock card creation
			supabaseMocks.singleMock.mockResolvedValueOnce({
				data: { id: "card_123", content: "Test card" },
				error: null,
			});

			const request = createMockRequest(
				"http://localhost:3000/api/boards/board_123/cards",
				{
					method: "POST",
					body: {
						column_id: "column_123",
						content: "Test card",
						position: 0,
					},
				},
			);

			const response = await POST(request, {
				params: Promise.resolve({ boardId: "board_123" }),
			});
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.card).toBeDefined();
		});

		it("should still prevent non-owners from adding to action columns", async () => {
			setupAuthenticatedUser("different_user_123");

			// Mock different user exists
			supabaseMocks.maybeSingleMock.mockResolvedValueOnce({
				data: { id: "different_db_user_123", clerk_id: "different_user_123" },
				error: null,
			});

			// Mock user is participant (not owner)
			supabaseMocks.maybeSingleMock.mockResolvedValueOnce({
				data: { id: "participant_123", role: "participant" },
				error: null,
			});

			// Mock column fetch - action column with different owner
			const mockActionColumn = {
				id: "column_action_123",
				name: "Action Items",
				is_action: true,
				board: {
					...mockBoard,
					owner_id: "db_user_123", // Different owner
				},
			};
			supabaseMocks.singleMock.mockResolvedValueOnce({
				data: mockActionColumn,
				error: null,
			});

			const request = createMockRequest(
				"http://localhost:3000/api/boards/board_123/cards",
				{
					method: "POST",
					body: {
						column_id: "column_action_123",
						content: "Test action item",
						position: 0,
					},
				},
			);

			const response = await POST(request, {
				params: Promise.resolve({ boardId: "board_123" }),
			});
			const data = await response.json();

			expect(response.status).toBe(403);
			expect(data.error).toBe(
				"Only board owners can add cards to action columns",
			);
		});

		it("should reject card creation when timer is paused during creation phase", async () => {
			setupAuthenticatedUser();

			// Mock user fetch
			supabaseMocks.maybeSingleMock.mockResolvedValueOnce({
				data: mockDbUser,
				error: null,
			});

			// Mock user is participant
			supabaseMocks.maybeSingleMock.mockResolvedValueOnce({
				data: { id: "participant_123", role: "participant" },
				error: null,
			});

			// Mock column fetch - non-action column with paused timer
			const mockColumn = {
				id: "column_123",
				name: "What went well",
				is_action: false,
				board: {
					...mockBoard,
					phase: "creation",
					phase_started_at: new Date().toISOString(),
					phase_ends_at: null, // Timer is paused
				},
			};
			supabaseMocks.singleMock.mockResolvedValueOnce({
				data: mockColumn,
				error: null,
			});

			const request = createMockRequest(
				"http://localhost:3000/api/boards/board_123/cards",
				{
					method: "POST",
					body: {
						column_id: "column_123",
						content: "Test card",
						position: 0,
					},
				},
			);

			const response = await POST(request, {
				params: Promise.resolve({ boardId: "board_123" }),
			});
			const data = await response.json();

			expect(response.status).toBe(403);
			expect(data.error).toBe(
				"Cards cannot be added while the timer is paused",
			);
		});
	});

	describe("User sync", () => {
		it("should automatically sync user if not in database", async () => {
			setupAuthenticatedUser();

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

			// Mock user is participant
			supabaseMocks.maybeSingleMock.mockResolvedValueOnce({
				data: { id: "participant_123", role: "participant" },
				error: null,
			});

			// Mock column fetch
			const mockColumn = {
				id: "column_123",
				name: "What went well",
				is_action: false,
				board: mockBoard,
			};
			supabaseMocks.singleMock.mockResolvedValueOnce({
				data: mockColumn,
				error: null,
			});

			// Mock card creation
			supabaseMocks.singleMock.mockResolvedValueOnce({
				data: { id: "card_123", content: "Test card" },
				error: null,
			});

			const request = createMockRequest(
				"http://localhost:3000/api/boards/board_123/cards",
				{
					method: "POST",
					body: {
						column_id: "column_123",
						content: "Test card",
						position: 0,
					},
				},
			);

			const response = await POST(request, {
				params: Promise.resolve({ boardId: "board_123" }),
			});
			await response.json();

			expect(response.status).toBe(200);
			expect(currentUser).toHaveBeenCalled();
			expect(supabaseMocks.insertMock).toHaveBeenCalledWith(
				expect.objectContaining({
					clerk_id: mockClerkUser.id,
				}),
			);
		});
	});
});
