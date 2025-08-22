import { nanoid } from "nanoid";
import { cookies } from "next/headers";
import { supabaseAdmin } from "~/lib/supabase/admin";
import { POST } from "./route";

jest.mock("~/lib/supabase/admin");
jest.mock("nanoid");
jest.mock("next/headers");

describe("POST /api/anonymous/create", () => {
	const mockSupabaseAdmin = supabaseAdmin as jest.Mocked<typeof supabaseAdmin>;
	const mockNanoid = nanoid as jest.Mock;
	const mockCookies = cookies as jest.Mock;

	beforeEach(() => {
		jest.clearAllMocks();
		mockNanoid.mockReturnValue("test-session-id");
		mockCookies.mockResolvedValue({
			set: jest.fn(),
		});
	});

	it("should create a new anonymous user successfully", async () => {
		const mockRequest = new Request(
			"http://localhost:3000/api/anonymous/create",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "Test User" }),
			},
		);

		const mockUser = {
			id: "user-123",
			session_id: "test-session-id",
			name: "Test User",
			created_at: new Date().toISOString(),
		};

		mockSupabaseAdmin.from = jest.fn().mockReturnValue({
			insert: jest.fn().mockReturnValue({
				select: jest.fn().mockReturnValue({
					single: jest.fn().mockResolvedValue({
						data: mockUser,
						error: null,
					}),
				}),
			}),
		});

		const response = await POST(mockRequest);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data).toEqual({ user: mockUser });
		expect(mockSupabaseAdmin.from).toHaveBeenCalledWith("anonymous_users");
		expect(mockCookies().set).toHaveBeenCalledWith(
			"anonymous_session_id",
			"test-session-id",
			expect.objectContaining({
				httpOnly: true,
				secure: true,
				sameSite: "lax",
				maxAge: expect.any(Number),
			}),
		);
	});

	it("should handle database errors gracefully", async () => {
		const mockRequest = new Request(
			"http://localhost:3000/api/anonymous/create",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "Test User" }),
			},
		);

		mockSupabaseAdmin.from = jest.fn().mockReturnValue({
			insert: jest.fn().mockReturnValue({
				select: jest.fn().mockReturnValue({
					single: jest.fn().mockResolvedValue({
						data: null,
						error: { message: "Database error" },
					}),
				}),
			}),
		});

		const response = await POST(mockRequest);
		const data = await response.json();

		expect(response.status).toBe(500);
		expect(data).toEqual({ error: "Database error" });
	});

	it("should handle missing name in request body", async () => {
		const mockRequest = new Request(
			"http://localhost:3000/api/anonymous/create",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			},
		);

		const mockUser = {
			id: "user-123",
			session_id: "test-session-id",
			name: "Anonymous User",
			created_at: new Date().toISOString(),
		};

		mockSupabaseAdmin.from = jest.fn().mockReturnValue({
			insert: jest.fn().mockReturnValue({
				select: jest.fn().mockReturnValue({
					single: jest.fn().mockResolvedValue({
						data: mockUser,
						error: null,
					}),
				}),
			}),
		});

		const response = await POST(mockRequest);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data).toEqual({ user: mockUser });
	});

	it("should handle unexpected errors", async () => {
		const mockRequest = new Request(
			"http://localhost:3000/api/anonymous/create",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "Test User" }),
			},
		);

		mockSupabaseAdmin.from = jest.fn().mockImplementation(() => {
			throw new Error("Unexpected error");
		});

		const response = await POST(mockRequest);
		const data = await response.json();

		expect(response.status).toBe(500);
		expect(data).toEqual({ error: "Unexpected error" });
	});
});
