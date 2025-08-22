import { useUser } from "@clerk/nextjs";
import { renderHook, waitFor } from "@testing-library/react";
import { useUserSync } from "./useUserSync";

jest.mock("@clerk/nextjs");

// Mock fetch globally
global.fetch = jest.fn();

describe("useUserSync", () => {
	const mockUseUser = useUser as jest.Mock;
	const mockFetch = fetch as jest.Mock;

	beforeEach(() => {
		jest.clearAllMocks();
		localStorage.clear();
	});

	it("should sync user data when user is loaded", async () => {
		const mockUser = {
			id: "user-123",
			emailAddresses: [{ emailAddress: "test@example.com" }],
			firstName: "John",
			lastName: "Doe",
			imageUrl: "https://example.com/avatar.jpg",
		};

		mockUseUser.mockReturnValue({
			isLoaded: true,
			user: mockUser,
		});

		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ user: { id: "db-user-123" } }),
		});

		renderHook(() => useUserSync());

		await waitFor(() => {
			expect(mockFetch).toHaveBeenCalledWith("/api/users/sync", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					email: "test@example.com",
					name: "John Doe",
					avatar_url: "https://example.com/avatar.jpg",
				}),
			});
		});

		expect(localStorage.getItem("user_synced_user-123")).toBe("true");
	});

	it("should not sync if user is not loaded", () => {
		mockUseUser.mockReturnValue({
			isLoaded: false,
			user: null,
		});

		renderHook(() => useUserSync());

		expect(mockFetch).not.toHaveBeenCalled();
	});

	it("should not sync if user is null", () => {
		mockUseUser.mockReturnValue({
			isLoaded: true,
			user: null,
		});

		renderHook(() => useUserSync());

		expect(mockFetch).not.toHaveBeenCalled();
	});

	it("should not sync if already synced", () => {
		const mockUser = {
			id: "user-123",
			emailAddresses: [{ emailAddress: "test@example.com" }],
			firstName: "John",
			lastName: "Doe",
			imageUrl: "https://example.com/avatar.jpg",
		};

		// Mark as already synced
		localStorage.setItem("user_synced_user-123", "true");

		mockUseUser.mockReturnValue({
			isLoaded: true,
			user: mockUser,
		});

		renderHook(() => useUserSync());

		expect(mockFetch).not.toHaveBeenCalled();
	});

	it("should handle sync errors gracefully", async () => {
		const mockUser = {
			id: "user-123",
			emailAddresses: [{ emailAddress: "test@example.com" }],
			firstName: "John",
			lastName: "Doe",
			imageUrl: "https://example.com/avatar.jpg",
		};

		mockUseUser.mockReturnValue({
			isLoaded: true,
			user: mockUser,
		});

		const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();
		mockFetch.mockRejectedValueOnce(new Error("Network error"));

		renderHook(() => useUserSync());

		await waitFor(() => {
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				"Failed to sync user:",
				expect.any(Error),
			);
		});

		// Should not mark as synced on error
		expect(localStorage.getItem("user_synced_user-123")).toBeNull();

		consoleErrorSpy.mockRestore();
	});

	it("should handle missing email gracefully", async () => {
		const mockUser = {
			id: "user-123",
			emailAddresses: [],
			firstName: "John",
			lastName: "Doe",
			imageUrl: "https://example.com/avatar.jpg",
		};

		mockUseUser.mockReturnValue({
			isLoaded: true,
			user: mockUser,
		});

		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ user: { id: "db-user-123" } }),
		});

		renderHook(() => useUserSync());

		await waitFor(() => {
			expect(mockFetch).toHaveBeenCalledWith("/api/users/sync", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					email: "",
					name: "John Doe",
					avatar_url: "https://example.com/avatar.jpg",
				}),
			});
		});
	});

	it("should handle missing names gracefully", async () => {
		const mockUser = {
			id: "user-123",
			emailAddresses: [{ emailAddress: "test@example.com" }],
			firstName: null,
			lastName: null,
			imageUrl: null,
		};

		mockUseUser.mockReturnValue({
			isLoaded: true,
			user: mockUser,
		});

		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ user: { id: "db-user-123" } }),
		});

		renderHook(() => useUserSync());

		await waitFor(() => {
			expect(mockFetch).toHaveBeenCalledWith("/api/users/sync", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					email: "test@example.com",
					name: "",
					avatar_url: null,
				}),
			});
		});
	});

	it("should re-sync when user changes", async () => {
		const mockUser1 = {
			id: "user-123",
			emailAddresses: [{ emailAddress: "test1@example.com" }],
			firstName: "John",
			lastName: "Doe",
			imageUrl: null,
		};

		const mockUser2 = {
			id: "user-456",
			emailAddresses: [{ emailAddress: "test2@example.com" }],
			firstName: "Jane",
			lastName: "Smith",
			imageUrl: null,
		};

		mockFetch.mockResolvedValue({
			ok: true,
			json: async () => ({ user: { id: "db-user-123" } }),
		});

		// Initial render with first user
		mockUseUser.mockReturnValue({
			isLoaded: true,
			user: mockUser1,
		});

		const { rerender } = renderHook(() => useUserSync());

		await waitFor(() => {
			expect(mockFetch).toHaveBeenCalledTimes(1);
		});

		// Change to second user
		mockUseUser.mockReturnValue({
			isLoaded: true,
			user: mockUser2,
		});

		rerender();

		await waitFor(() => {
			expect(mockFetch).toHaveBeenCalledTimes(2);
			expect(mockFetch).toHaveBeenLastCalledWith("/api/users/sync", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					email: "test2@example.com",
					name: "Jane Smith",
					avatar_url: null,
				}),
			});
		});
	});
});
