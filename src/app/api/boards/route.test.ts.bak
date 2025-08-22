import { auth } from "@clerk/nextjs/server";
import { nanoid } from "nanoid";
import { cookies } from "next/headers";
import { supabaseAdmin } from "~/lib/supabase/admin";
import { createAuthenticatedSupabaseClient } from "~/lib/supabase/server";
import { POST } from "./route";

jest.mock("@clerk/nextjs/server");
jest.mock("~/lib/supabase/admin");
jest.mock("~/lib/supabase/server");
jest.mock("nanoid");
jest.mock("next/headers");

describe("/api/boards", () => {
	const mockAuth = auth as unknown as jest.Mock;
	const mockSupabaseAdmin = supabaseAdmin as jest.Mocked<typeof supabaseAdmin>;
	const _mockCreateAuthenticatedSupabaseClient =
		createAuthenticatedSupabaseClient as jest.Mock;
	const mockNanoid = nanoid as jest.Mock;
	const mockCookies = cookies as jest.Mock;

	beforeEach(() => {
		jest.clearAllMocks();
		mockNanoid.mockReturnValue("test-share-id");
		mockCookies.mockResolvedValue({
			get: jest.fn().mockReturnValue({ value: "anonymous-session-id" }),
		});
	});

	describe("POST /api/boards", () => {
		it("should create a board for authenticated user", async () => {
			mockAuth.mockResolvedValue({ userId: "user-123" });

			const mockRequest = new Request("http://localhost:3000/api/boards", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: "New Board",
					description: "Board description",
				}),
			});

			const mockBoard = {
				id: "board-123",
				name: "New Board",
				description: "Board description",
				share_id: "test-share-id",
			};

			const mockUser = { id: "db-user-123" };

			mockSupabaseAdmin.from = jest
				.fn()
				.mockImplementationOnce(() => ({
					select: jest.fn().mockReturnValue({
						eq: jest.fn().mockReturnValue({
							maybeSingle: jest.fn().mockResolvedValue({
								data: mockUser,
								error: null,
							}),
						}),
					}),
				}))
				.mockImplementationOnce(() => ({
					insert: jest.fn().mockReturnValue({
						select: jest.fn().mockReturnValue({
							single: jest.fn().mockResolvedValue({
								data: mockBoard,
								error: null,
							}),
						}),
					}),
				}))
				.mockImplementationOnce(() => ({
					insert: jest.fn().mockResolvedValue({
						data: null,
						error: null,
					}),
				}));

			const response = await POST(mockRequest);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data).toEqual({ board: mockBoard });
			expect(mockSupabaseAdmin.from).toHaveBeenCalledWith("users");
			expect(mockSupabaseAdmin.from).toHaveBeenCalledWith("boards");
			expect(mockSupabaseAdmin.from).toHaveBeenCalledWith("board_participants");
		});

		it("should create a board for anonymous user", async () => {
			mockAuth.mockResolvedValue({ userId: null });

			const mockRequest = new Request("http://localhost:3000/api/boards", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: "New Board",
					description: "Board description",
				}),
			});

			const mockBoard = {
				id: "board-123",
				name: "New Board",
				description: "Board description",
				share_id: "test-share-id",
			};

			const mockAnonymousUser = {
				id: "anon-user-123",
				session_id: "anonymous-session-id",
			};

			mockSupabaseAdmin.from = jest
				.fn()
				.mockImplementationOnce(() => ({
					select: jest.fn().mockReturnValue({
						eq: jest.fn().mockReturnValue({
							maybeSingle: jest.fn().mockResolvedValue({
								data: mockAnonymousUser,
								error: null,
							}),
						}),
					}),
				}))
				.mockImplementationOnce(() => ({
					insert: jest.fn().mockReturnValue({
						select: jest.fn().mockReturnValue({
							single: jest.fn().mockResolvedValue({
								data: mockBoard,
								error: null,
							}),
						}),
					}),
				}))
				.mockImplementationOnce(() => ({
					insert: jest.fn().mockResolvedValue({
						data: null,
						error: null,
					}),
				}));

			const response = await POST(mockRequest);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data).toEqual({ board: mockBoard });
		});

		it("should return 401 for unauthenticated users", async () => {
			mockAuth.mockResolvedValue({ userId: null });
			mockCookies.mockResolvedValue({
				get: jest.fn().mockReturnValue(null),
			});

			const mockRequest = new Request("http://localhost:3000/api/boards", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: "New Board",
				}),
			});

			const response = await POST(mockRequest);
			const data = await response.json();

			expect(response.status).toBe(401);
			expect(data).toEqual({ error: "Unauthorized" });
		});

		it("should handle database errors during board creation", async () => {
			mockAuth.mockResolvedValue({ userId: "user-123" });

			const mockRequest = new Request("http://localhost:3000/api/boards", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: "New Board",
				}),
			});

			const mockUser = { id: "db-user-123" };

			mockSupabaseAdmin.from = jest
				.fn()
				.mockImplementationOnce(() => ({
					select: jest.fn().mockReturnValue({
						eq: jest.fn().mockReturnValue({
							maybeSingle: jest.fn().mockResolvedValue({
								data: mockUser,
								error: null,
							}),
						}),
					}),
				}))
				.mockImplementationOnce(() => ({
					insert: jest.fn().mockReturnValue({
						select: jest.fn().mockReturnValue({
							single: jest.fn().mockResolvedValue({
								data: null,
								error: { message: "Database error" },
							}),
						}),
					}),
				}));

			const response = await POST(mockRequest);
			const data = await response.json();

			expect(response.status).toBe(500);
			expect(data).toEqual({ error: "Database error" });
		});
	});
});
