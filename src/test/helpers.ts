import { auth as clerkAuth, currentUser } from "@clerk/nextjs/server";
import { supabaseAdmin } from "~/lib/supabase/admin";

// Mock user data
export const mockClerkUser = {
	id: "clerk_test_user_123",
	emailAddresses: [{ emailAddress: "test@example.com" }],
	fullName: "Test User",
	username: "testuser",
	imageUrl: "https://example.com/avatar.jpg",
};

export const mockDbUser = {
	id: "db_user_123",
	clerk_id: "clerk_test_user_123",
	email: "test@example.com",
	name: "Test User",
	avatar_url: "https://example.com/avatar.jpg",
};

export const mockBoard = {
	id: "board_123",
	name: "Test Board",
	description: "Test Description",
	owner_id: "db_user_123",
	is_active: true,
	share_id: "share_123",
	phase: "creation" as const,
	creation_time_minutes: 5,
	voting_time_minutes: 3,
	votes_per_user: 5,
};

export const mockBoardInSetup = {
	...mockBoard,
	phase: "setup" as const,
};

export const mockAnonymousUser = {
	id: "anon_user_123",
	session_id: "anon_session_123",
	display_name: "Anonymous User",
};

// Helper to create mock request
export function createMockRequest(
	url: string,
	options: {
		method?: string;
		body?: unknown;
		headers?: Record<string, string>;
	} = {},
) {
	return new Request(url, {
		method: options.method || "GET",
		headers: {
			"Content-Type": "application/json",
			...options.headers,
		},
		body: options.body ? JSON.stringify(options.body) : undefined,
	});
}

// Helper to setup mocks for authenticated user
export function setupAuthenticatedUser(userId = mockClerkUser.id) {
	(clerkAuth as unknown as jest.Mock).mockResolvedValue({ userId });
	(currentUser as unknown as jest.Mock).mockResolvedValue(mockClerkUser);
}

// Helper to setup mocks for unauthenticated user
export function setupUnauthenticatedUser() {
	(clerkAuth as unknown as jest.Mock).mockResolvedValue({ userId: null });
	(currentUser as unknown as jest.Mock).mockResolvedValue(null);
}

// Helper to setup Supabase mocks
export function setupSupabaseMocks() {
	const fromMock = jest.fn();
	const selectMock = jest.fn();
	const insertMock = jest.fn();
	const updateMock = jest.fn();
	const deleteMock = jest.fn();
	const eqMock = jest.fn();
	const maybeSingleMock = jest.fn();
	const singleMock = jest.fn();
	const orderMock = jest.fn();

	// Create chain object that's returned by most methods
	const chainObj = {
		select: selectMock,
		insert: insertMock,
		update: updateMock,
		delete: deleteMock,
		eq: eqMock,
		maybeSingle: maybeSingleMock,
		single: singleMock,
		order: orderMock,
	};

	// Make each method return the chain object for chaining
	fromMock.mockReturnValue(chainObj);
	selectMock.mockReturnValue(chainObj);
	insertMock.mockReturnValue(chainObj);
	updateMock.mockReturnValue(chainObj);
	deleteMock.mockReturnValue(chainObj);
	eqMock.mockReturnValue(chainObj);
	orderMock.mockReturnValue(chainObj);

	// These return promises with data
	maybeSingleMock.mockResolvedValue({ data: null, error: null });
	singleMock.mockResolvedValue({ data: null, error: null });

	(supabaseAdmin.from as jest.Mock) = fromMock;

	return {
		fromMock,
		selectMock,
		insertMock,
		updateMock,
		deleteMock,
		eqMock,
		maybeSingleMock,
		singleMock,
		orderMock,
	};
}

// Helper to mock cookies
export function setupCookiesMock(cookies: Record<string, string> = {}) {
	const cookieStore = {
		get: jest.fn((name: string) => ({
			value: cookies[name] || undefined,
		})),
		set: jest.fn(),
		delete: jest.fn(),
	};

	return cookieStore;
}
