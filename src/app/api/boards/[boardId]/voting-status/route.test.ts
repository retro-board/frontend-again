import { cookies } from "next/headers";
import { broadcastBoardEvent } from "~/lib/realtime/broadcast";
import {
	createMockRequest,
	mockBoard,
	mockDbUser,
	setupAuthenticatedUser,
	setupDatabaseMocks,
	setupUnauthenticatedUser,
} from "~/test/helpers";
import { GET, POST } from "./route";

jest.mock("@clerk/nextjs/server");
jest.mock("next/headers");
jest.mock("~/lib/db", () => ({
	db: {
		from: jest.fn(),
	},
}));
jest.mock("~/lib/realtime/broadcast");

describe("/api/boards/[boardId]/voting-status", () => {
	let databaseMocks: ReturnType<typeof setupDatabaseMocks>;

	beforeEach(() => {
		jest.clearAllMocks();
		databaseMocks = setupDatabaseMocks();
		(cookies as unknown as jest.Mock).mockResolvedValue({
			get: jest.fn(() => ({ value: undefined })),
			set: jest.fn(),
			delete: jest.fn(),
		});
		(broadcastBoardEvent as jest.Mock).mockResolvedValue(undefined);
	});

	describe("GET", () => {
		it("should return allVotesUsed as false when not in voting phase", async () => {
			setupAuthenticatedUser();

			// Mock board in creation phase - need to set up the chain properly
			databaseMocks.fromMock.mockReturnValueOnce({
				select: jest.fn().mockReturnThis(),
				eq: jest.fn().mockReturnThis(),
				single: jest.fn().mockResolvedValueOnce({
					data: { ...mockBoard, phase: "creation" },
					error: null,
				}),
			});

			const request = createMockRequest(
				"http://localhost:3000/api/boards/board_123/voting-status",
			);

			const response = await GET(request, {
				params: Promise.resolve({ boardId: "board_123" }),
			});
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.allVotesUsed).toBe(false);
		});

		it("should check vote counts correctly when in voting phase", async () => {
			setupAuthenticatedUser();

			// Mock board in voting phase with 3 votes per user
			databaseMocks.fromMock.mockReturnValueOnce({
				select: jest.fn().mockReturnThis(),
				eq: jest.fn().mockReturnThis(),
				single: jest.fn().mockResolvedValueOnce({
					data: { ...mockBoard, phase: "voting", votes_per_user: 3 },
					error: null,
				}),
			});

			// Mock participants - 2 users
			const mockParticipants = [
				{ user_id: "user_1", anonymous_user_id: null },
				{ user_id: "user_2", anonymous_user_id: null },
			];
			databaseMocks.fromMock.mockReturnValueOnce({
				select: jest.fn().mockReturnThis(),
				eq: jest.fn().mockResolvedValueOnce({
					data: mockParticipants,
					error: null,
				}),
			});

			// Anonymous membership is queried separately.
			databaseMocks.fromMock.mockReturnValueOnce({
				select: jest.fn().mockReturnThis(),
				eq: jest.fn().mockResolvedValue({ data: [], error: null }),
			});

			// Mock columns (non-action) - has two chained .eq() calls
			const mockColumns = [{ id: "col_1" }, { id: "col_2" }];
			const columnChain = {
				select: jest.fn().mockReturnThis(),
				eq: jest.fn().mockReturnThis(),
			};
			// Second eq() resolves the promise
			columnChain.eq = jest.fn().mockImplementation((key, _value) => {
				if (key === "board_id") {
					return columnChain; // First eq() returns chain
				}
				// Second eq() for is_action returns the resolved data
				return Promise.resolve({
					data: mockColumns,
					error: null,
				});
			});
			databaseMocks.fromMock.mockReturnValueOnce(columnChain);

			// Mock cards
			const mockCards = [{ id: "card_1" }, { id: "card_2" }, { id: "card_3" }];
			databaseMocks.fromMock.mockReturnValueOnce({
				select: jest.fn().mockReturnThis(),
				in: jest.fn().mockResolvedValueOnce({
					data: mockCards,
					error: null,
				}),
			});

			// Mock votes - user_1 has 3 votes (all used)
			databaseMocks.fromMock.mockReturnValueOnce({
				select: jest.fn().mockReturnThis(),
				in: jest.fn().mockReturnThis(),
				eq: jest.fn().mockResolvedValueOnce({
					data: [{ id: "vote_1" }, { id: "vote_2" }, { id: "vote_3" }],
					error: null,
				}),
			});

			// Mock votes - user_2 has 2 votes
			databaseMocks.fromMock.mockReturnValueOnce({
				select: jest.fn().mockReturnThis(),
				in: jest.fn().mockReturnThis(),
				eq: jest.fn().mockResolvedValueOnce({
					data: [{ id: "vote_4" }, { id: "vote_5" }],
					error: null,
				}),
			});

			const request = createMockRequest(
				"http://localhost:3000/api/boards/board_123/voting-status",
			);

			const response = await GET(request, {
				params: Promise.resolve({ boardId: "board_123" }),
			});
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.allVotesUsed).toBe(false);
			expect(data.votesPerUser).toBe(3);
			expect(data.participantCount).toBe(2);
		});

		it("should return allVotesUsed as true when all participants have used all votes", async () => {
			setupAuthenticatedUser();

			// Mock board in voting phase with 3 votes per user
			databaseMocks.fromMock.mockReturnValueOnce({
				select: jest.fn().mockReturnThis(),
				eq: jest.fn().mockReturnThis(),
				single: jest.fn().mockResolvedValueOnce({
					data: { ...mockBoard, phase: "voting", votes_per_user: 3 },
					error: null,
				}),
			});

			// Mock participants - 2 users
			const mockParticipants = [
				{ user_id: "user_1", anonymous_user_id: null },
				{ user_id: "user_2", anonymous_user_id: null },
			];
			databaseMocks.fromMock.mockReturnValueOnce({
				select: jest.fn().mockReturnThis(),
				eq: jest.fn().mockResolvedValueOnce({
					data: mockParticipants,
					error: null,
				}),
			});

			// Anonymous membership is queried separately.
			databaseMocks.fromMock.mockReturnValueOnce({
				select: jest.fn().mockReturnThis(),
				eq: jest.fn().mockResolvedValue({ data: [], error: null }),
			});

			// Mock columns (non-action) - has two chained .eq() calls
			const mockColumns = [{ id: "col_1" }, { id: "col_2" }];
			const columnChain = {
				select: jest.fn().mockReturnThis(),
				eq: jest.fn().mockReturnThis(),
			};
			// Second eq() resolves the promise
			columnChain.eq = jest.fn().mockImplementation((key, _value) => {
				if (key === "board_id") {
					return columnChain; // First eq() returns chain
				}
				// Second eq() for is_action returns the resolved data
				return Promise.resolve({
					data: mockColumns,
					error: null,
				});
			});
			databaseMocks.fromMock.mockReturnValueOnce(columnChain);

			// Mock cards
			const mockCards = [{ id: "card_1" }, { id: "card_2" }, { id: "card_3" }];
			databaseMocks.fromMock.mockReturnValueOnce({
				select: jest.fn().mockReturnThis(),
				in: jest.fn().mockResolvedValueOnce({
					data: mockCards,
					error: null,
				}),
			});

			// Mock votes - both users have 3 votes each (all used)
			// The route builds the query then calls eq() on it, then awaits the result
			let voteCallCount = 0;
			const voteMockData = [
				[{ id: "vote_1" }, { id: "vote_2" }, { id: "vote_3" }], // user_1's votes
				[{ id: "vote_4" }, { id: "vote_5" }, { id: "vote_6" }], // user_2's votes
			];

			// Mock both vote queries
			for (let i = 0; i < 2; i++) {
				const votesQuery = {
					select: jest.fn().mockReturnThis(),
					in: jest.fn().mockReturnThis(),
					eq: jest.fn(),
					// biome-ignore lint/suspicious/noThenProperty: Mocking a thenable query object
					then: jest.fn((resolve) => {
						resolve({ data: voteMockData[voteCallCount++], error: null });
					}),
				};

				// eq() should return the query object (which is thenable)
				votesQuery.eq.mockReturnValue(votesQuery);

				databaseMocks.fromMock.mockReturnValueOnce(votesQuery);
			}

			const request = createMockRequest(
				"http://localhost:3000/api/boards/board_123/voting-status",
			);

			const response = await GET(request, {
				params: Promise.resolve({ boardId: "board_123" }),
			});
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.allVotesUsed).toBe(true);
			expect(data.votesPerUser).toBe(3);
			expect(data.participantCount).toBe(2);
		});

		it("should return unauthorized when not authenticated", async () => {
			setupUnauthenticatedUser();

			const request = createMockRequest(
				"http://localhost:3000/api/boards/board_123/voting-status",
			);

			const response = await GET(request, {
				params: Promise.resolve({ boardId: "board_123" }),
			});
			const data = await response.json();

			expect(response.status).toBe(401);
			expect(data.error).toBe("Unauthorized");
		});
	});

	describe("POST", () => {
		it("should end voting phase and transition to discussion", async () => {
			setupAuthenticatedUser();

			// Mock board in voting phase
			databaseMocks.fromMock.mockReturnValueOnce({
				select: jest.fn().mockReturnThis(),
				eq: jest.fn().mockReturnThis(),
				single: jest.fn().mockResolvedValueOnce({
					data: {
						...mockBoard,
						phase: "voting",
						owner_id: mockDbUser.id,
					},
					error: null,
				}),
			});

			// Mock user lookup
			databaseMocks.fromMock.mockReturnValueOnce({
				select: jest.fn().mockReturnThis(),
				eq: jest.fn().mockReturnThis(),
				maybeSingle: jest.fn().mockResolvedValueOnce({
					data: mockDbUser,
					error: null,
				}),
			});

			// Mock phase update
			databaseMocks.fromMock.mockReturnValueOnce({
				update: jest.fn().mockReturnThis(),
				eq: jest.fn().mockResolvedValueOnce({ error: null }),
			});

			const request = createMockRequest(
				"http://localhost:3000/api/boards/board_123/voting-status",
				{ method: "POST" },
			);

			const response = await POST(request, {
				params: Promise.resolve({ boardId: "board_123" }),
			});
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.newPhase).toBe("discussion");
			expect(broadcastBoardEvent).toHaveBeenCalledWith(
				"board_123",
				"phase_changed",
				{
					previousPhase: "voting",
					newPhase: "discussion",
				},
			);
		});

		it("should reject non-owners from ending voting", async () => {
			setupAuthenticatedUser();

			// Mock board with different owner
			databaseMocks.fromMock.mockReturnValueOnce({
				select: jest.fn().mockReturnThis(),
				eq: jest.fn().mockReturnThis(),
				single: jest.fn().mockResolvedValueOnce({
					data: {
						...mockBoard,
						phase: "voting",
						owner_id: "different_user_id",
					},
					error: null,
				}),
			});

			// Mock user lookup
			databaseMocks.fromMock.mockReturnValueOnce({
				select: jest.fn().mockReturnThis(),
				eq: jest.fn().mockReturnThis(),
				maybeSingle: jest.fn().mockResolvedValueOnce({
					data: mockDbUser,
					error: null,
				}),
			});

			const request = createMockRequest(
				"http://localhost:3000/api/boards/board_123/voting-status",
				{ method: "POST" },
			);

			const response = await POST(request, {
				params: Promise.resolve({ boardId: "board_123" }),
			});
			const data = await response.json();

			expect(response.status).toBe(403);
			expect(data.error).toBe("Only the board owner can end voting");
		});

		it("should reject ending voting when not in voting phase", async () => {
			setupAuthenticatedUser();

			// Mock board in creation phase
			databaseMocks.fromMock.mockReturnValueOnce({
				select: jest.fn().mockReturnThis(),
				eq: jest.fn().mockReturnThis(),
				single: jest.fn().mockResolvedValueOnce({
					data: {
						...mockBoard,
						phase: "creation",
						owner_id: mockDbUser.id,
					},
					error: null,
				}),
			});

			// Mock user lookup
			databaseMocks.fromMock.mockReturnValueOnce({
				select: jest.fn().mockReturnThis(),
				eq: jest.fn().mockReturnThis(),
				maybeSingle: jest.fn().mockResolvedValueOnce({
					data: mockDbUser,
					error: null,
				}),
			});

			const request = createMockRequest(
				"http://localhost:3000/api/boards/board_123/voting-status",
				{ method: "POST" },
			);

			const response = await POST(request, {
				params: Promise.resolve({ boardId: "board_123" }),
			});
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toBe("Board is not in voting phase");
		});

		it("should return unauthorized when not authenticated", async () => {
			setupUnauthenticatedUser();

			const request = createMockRequest(
				"http://localhost:3000/api/boards/board_123/voting-status",
				{ method: "POST" },
			);

			const response = await POST(request, {
				params: Promise.resolve({ boardId: "board_123" }),
			});
			const data = await response.json();

			expect(response.status).toBe(401);
			expect(data.error).toBe("Unauthorized");
		});
	});
});
