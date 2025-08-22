import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import jwt from "jsonwebtoken";
import { env } from "~/env";
import { supabaseAdmin } from "./admin";
import { createAuthenticatedSupabaseClient } from "./server";

jest.mock("@clerk/nextjs/server");
jest.mock("./admin");
jest.mock("jsonwebtoken");
jest.mock("@supabase/supabase-js");
jest.mock("~/env", () => ({
	env: {
		NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
		NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
		SUPABASE_JWT_SECRET: "test-jwt-secret",
		SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
	},
}));

describe("createAuthenticatedSupabaseClient", () => {
	const mockAuth = auth as unknown as jest.Mock;
	const mockSupabaseAdmin = supabaseAdmin as jest.Mocked<typeof supabaseAdmin>;
	const mockJwtSign = jwt.sign as jest.Mock;
	const mockCreateClient = createClient as jest.Mock;

	beforeEach(() => {
		jest.clearAllMocks();
		mockJwtSign.mockReturnValue("test-jwt-token");
		mockCreateClient.mockReturnValue({
			from: jest.fn(),
			auth: {},
		});
	});

	it("should create an authenticated Supabase client for existing user", async () => {
		mockAuth.mockResolvedValue({ userId: "clerk-user-123" });

		const mockDbUser = {
			id: "db-user-123",
			clerk_id: "clerk-user-123",
		};

		mockSupabaseAdmin.from = jest.fn().mockReturnValue({
			select: jest.fn().mockReturnValue({
				eq: jest.fn().mockReturnValue({
					maybeSingle: jest.fn().mockResolvedValue({
						data: mockDbUser,
						error: null,
					}),
				}),
			}),
		});

		const client = await createAuthenticatedSupabaseClient();

		expect(mockAuth).toHaveBeenCalled();
		expect(mockSupabaseAdmin.from).toHaveBeenCalledWith("users");
		expect(mockJwtSign).toHaveBeenCalledWith(
			expect.objectContaining({
				sub: "clerk-user-123",
				role: "authenticated",
				aud: "authenticated",
			}),
			"test-jwt-secret",
			{ algorithm: "HS256" },
		);
		expect(mockCreateClient).toHaveBeenCalledWith(
			"https://test.supabase.co",
			"test-anon-key",
			expect.objectContaining({
				auth: {
					autoRefreshToken: false,
					persistSession: false,
				},
				global: {
					headers: {
						Authorization: "Bearer test-jwt-token",
					},
				},
			}),
		);
		expect(client).toBeDefined();
	});

	it("should create user if not exists", async () => {
		mockAuth.mockResolvedValue({ userId: "clerk-user-123" });

		mockSupabaseAdmin.from = jest
			.fn()
			.mockImplementationOnce(() => ({
				select: jest.fn().mockReturnValue({
					eq: jest.fn().mockReturnValue({
						maybeSingle: jest.fn().mockResolvedValue({
							data: null,
							error: null,
						}),
					}),
				}),
			}))
			.mockImplementationOnce(() => ({
				insert: jest.fn().mockResolvedValue({
					data: { id: "new-user-123" },
					error: null,
				}),
			}));

		const client = await createAuthenticatedSupabaseClient();

		expect(mockSupabaseAdmin.from).toHaveBeenNthCalledWith(1, "users");
		expect(mockSupabaseAdmin.from).toHaveBeenNthCalledWith(2, "users");
		expect(mockSupabaseAdmin.from).toHaveBeenCalledTimes(2);
		expect(client).toBeDefined();
	});

	it("should throw error if user is not authenticated", async () => {
		mockAuth.mockResolvedValue({ userId: null });

		await expect(createAuthenticatedSupabaseClient()).rejects.toThrow(
			"User not authenticated",
		);
	});

	it("should handle database errors when checking user existence", async () => {
		mockAuth.mockResolvedValue({ userId: "clerk-user-123" });

		mockSupabaseAdmin.from = jest
			.fn()
			.mockImplementationOnce(() => ({
				select: jest.fn().mockReturnValue({
					eq: jest.fn().mockReturnValue({
						maybeSingle: jest.fn().mockResolvedValue({
							data: null,
							error: null,
						}),
					}),
				}),
			}))
			.mockImplementationOnce(() => ({
				insert: jest.fn().mockResolvedValue({
					data: null,
					error: { code: "23505", message: "Duplicate key" },
				}),
			}));

		// Should not throw as it ignores duplicate key errors
		const client = await createAuthenticatedSupabaseClient();
		expect(client).toBeDefined();
	});

	it("should throw error for non-duplicate database errors", async () => {
		mockAuth.mockResolvedValue({ userId: "clerk-user-123" });

		mockSupabaseAdmin.from = jest
			.fn()
			.mockImplementationOnce(() => ({
				select: jest.fn().mockReturnValue({
					eq: jest.fn().mockReturnValue({
						maybeSingle: jest.fn().mockResolvedValue({
							data: null,
							error: null,
						}),
					}),
				}),
			}))
			.mockImplementationOnce(() => ({
				insert: jest.fn().mockResolvedValue({
					data: null,
					error: { code: "22001", message: "String too long" },
				}),
			}));

		await expect(createAuthenticatedSupabaseClient()).rejects.toThrow();
	});

	it("should use fallback service role key if JWT secret is not set", async () => {
		mockAuth.mockResolvedValue({ userId: "clerk-user-123" });

		const mockDbUser = {
			id: "db-user-123",
			clerk_id: "clerk-user-123",
		};

		mockSupabaseAdmin.from = jest.fn().mockReturnValue({
			select: jest.fn().mockReturnValue({
				eq: jest.fn().mockReturnValue({
					maybeSingle: jest.fn().mockResolvedValue({
						data: mockDbUser,
						error: null,
					}),
				}),
			}),
		});

		// Mock env without JWT secret
		const originalEnv = env.SUPABASE_JWT_SECRET;
		const envAny = env as { SUPABASE_JWT_SECRET: string | undefined };
		envAny.SUPABASE_JWT_SECRET = undefined;

		await createAuthenticatedSupabaseClient();

		expect(mockJwtSign).toHaveBeenCalledWith(
			expect.any(Object),
			"test-service-role-key",
			{ algorithm: "HS256" },
		);

		// Restore env
		const envAny2 = env as { SUPABASE_JWT_SECRET: string | undefined };
		envAny2.SUPABASE_JWT_SECRET = originalEnv;
	});
});
