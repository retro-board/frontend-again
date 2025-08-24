import { supabase } from "./client";

// Mock the Supabase createClient
jest.mock("@supabase/supabase-js", () => ({
	createClient: jest.fn(() => ({
		auth: {
			getUser: jest.fn().mockResolvedValue({ data: null, error: null }),
			signOut: jest.fn().mockResolvedValue({ error: null }),
			getSession: jest.fn().mockResolvedValue({ data: null, error: null }),
		},
		from: jest.fn(() => ({
			select: jest.fn().mockReturnThis(),
			insert: jest.fn().mockReturnThis(),
			update: jest.fn().mockReturnThis(),
			delete: jest.fn().mockReturnThis(),
			eq: jest.fn().mockReturnThis(),
			single: jest.fn().mockResolvedValue({ data: null, error: null }),
		})),
	})),
}));

// Mock env
jest.mock("~/env", () => ({
	env: {
		NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
		NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
	},
}));

describe("Supabase Client", () => {
	it("should have a Supabase client instance", () => {
		expect(supabase).toBeDefined();
		expect(supabase.auth).toBeDefined();
		expect(supabase.from).toBeDefined();
	});

	it("should have auth methods", () => {
		expect(typeof supabase.auth.getUser).toBe("function");
		expect(typeof supabase.auth.signOut).toBe("function");
		expect(typeof supabase.auth.getSession).toBe("function");
	});

	it("should have database query methods", () => {
		expect(typeof supabase.from).toBe("function");
	});

	it("should be able to query tables", () => {
		const query = supabase.from("test_table");
		expect(query).toBeDefined();
		expect(typeof query.select).toBe("function");
		expect(typeof query.insert).toBe("function");
		expect(typeof query.update).toBe("function");
		expect(typeof query.delete).toBe("function");
	});

	it("should handle auth operations", async () => {
		const { error } = await supabase.auth.getUser();
		expect(error).toBeNull();

		const signOutResult = await supabase.auth.signOut();
		expect(signOutResult.error).toBeNull();
	});
});
