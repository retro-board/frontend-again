import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "~/lib/supabase/admin";
import { POST } from "./route";

// Mock dependencies
jest.mock("@clerk/nextjs/server", () => ({
	auth: jest.fn(),
}));

jest.mock("~/lib/supabase/admin", () => ({
	supabaseAdmin: {
		from: jest.fn(),
	},
}));

jest.mock("next/server", () => ({
	NextResponse: {
		json: jest.fn((data, init) => ({ data, init })),
	},
}));

describe("POST /api/poker-sessions/[sessionId]/score", () => {
	const mockAuth = auth as unknown as jest.Mock;
	const mockFrom = supabaseAdmin.from as jest.Mock;
	const sessionId = "session-123";
	const storyId = "story-123";
	const userId = "user-123";
	const dbUserId = "db-user-123";

	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe("authentication and authorization", () => {
		it("should return 401 if user is not authenticated", async () => {
			mockAuth.mockResolvedValue({ userId: null });

			const request = new Request("http://localhost", {
				method: "POST",
				body: JSON.stringify({ storyId }),
			});

			const response = await POST(request, {
				params: Promise.resolve({ sessionId }),
			});

			expect(response).toEqual({
				data: { error: "Unauthorized" },
				init: { status: 401 },
			});
		});

		it("should return 404 if user not found in database", async () => {
			mockAuth.mockResolvedValue({ userId });
			mockFrom.mockReturnValue({
				select: jest.fn().mockReturnValue({
					eq: jest.fn().mockReturnValue({
						maybeSingle: jest.fn().mockResolvedValue({ data: null }),
					}),
				}),
			});

			const request = new Request("http://localhost", {
				method: "POST",
				body: JSON.stringify({ storyId }),
			});

			const response = await POST(request, {
				params: Promise.resolve({ sessionId }),
			});

			expect(response).toEqual({
				data: { error: "User not found" },
				init: { status: 404 },
			});
		});

		it("should return 403 if user is not facilitator", async () => {
			mockAuth.mockResolvedValue({ userId });

			// Mock user lookup
			mockFrom.mockReturnValueOnce({
				select: jest.fn().mockReturnValue({
					eq: jest.fn().mockReturnValue({
						maybeSingle: jest
							.fn()
							.mockResolvedValue({ data: { id: dbUserId } }),
					}),
				}),
			});

			// Mock facilitator check
			mockFrom.mockReturnValueOnce({
				select: jest.fn().mockReturnValue({
					eq: jest.fn().mockReturnValue({
						eq: jest.fn().mockReturnValue({
							eq: jest.fn().mockReturnValue({
								maybeSingle: jest.fn().mockResolvedValue({ data: null }),
							}),
						}),
					}),
				}),
			});

			const request = new Request("http://localhost", {
				method: "POST",
				body: JSON.stringify({ storyId }),
			});

			const response = await POST(request, {
				params: Promise.resolve({ sessionId }),
			});

			expect(response).toEqual({
				data: { error: "Only facilitators can calculate scores" },
				init: { status: 403 },
			});
		});
	});

	describe("score calculation", () => {
		beforeEach(() => {
			mockAuth.mockResolvedValue({ userId });

			// Mock user lookup
			mockFrom.mockReturnValueOnce({
				select: jest.fn().mockReturnValue({
					eq: jest.fn().mockReturnValue({
						maybeSingle: jest
							.fn()
							.mockResolvedValue({ data: { id: dbUserId } }),
					}),
				}),
			});

			// Mock facilitator check
			mockFrom.mockReturnValueOnce({
				select: jest.fn().mockReturnValue({
					eq: jest.fn().mockReturnValue({
						eq: jest.fn().mockReturnValue({
							eq: jest.fn().mockReturnValue({
								maybeSingle: jest
									.fn()
									.mockResolvedValue({ data: { role: "facilitator" } }),
							}),
						}),
					}),
				}),
			});
		});

		describe("Fibonacci estimation", () => {
			it("should calculate mean and round up for fibonacci values", async () => {
				// Mock session lookup
				mockFrom.mockReturnValueOnce({
					select: jest.fn().mockReturnValue({
						eq: jest.fn().mockReturnValue({
							single: jest.fn().mockResolvedValue({
								data: { estimation_type: "fibonacci" },
							}),
						}),
					}),
				});

				// Mock votes lookup
				mockFrom.mockReturnValueOnce({
					select: jest.fn().mockReturnValue({
						eq: jest.fn().mockReturnValue({
							neq: jest.fn().mockResolvedValue({
								data: [
									{ vote_value: "3", users: { name: "John" } },
									{ vote_value: "5", users: { name: "Jane" } },
									{ vote_value: "8", users: { name: "Bob" } },
								],
							}),
						}),
					}),
				});

				// Mock story update
				mockFrom.mockReturnValueOnce({
					update: jest.fn().mockReturnValue({
						eq: jest.fn().mockResolvedValue({ data: null, error: null }),
					}),
				});

				const request = new Request("http://localhost", {
					method: "POST",
					body: JSON.stringify({ storyId }),
				});

				const response = await POST(request, {
					params: Promise.resolve({ sessionId }),
				});

				// Mean of 3, 5, 8 = 5.33, rounded up = 6, nearest fibonacci >= 6 = 8
				expect(response).toEqual({
					data: {
						finalScore: "8",
						votes: {
							John: "3",
							Jane: "5",
							Bob: "8",
						},
					},
					init: undefined,
				});
			});

			it("should handle question mark votes by excluding them", async () => {
				// Mock session lookup
				mockFrom.mockReturnValueOnce({
					select: jest.fn().mockReturnValue({
						eq: jest.fn().mockReturnValue({
							single: jest.fn().mockResolvedValue({
								data: { estimation_type: "fibonacci" },
							}),
						}),
					}),
				});

				// Mock votes lookup
				mockFrom.mockReturnValueOnce({
					select: jest.fn().mockReturnValue({
						eq: jest.fn().mockReturnValue({
							neq: jest.fn().mockResolvedValue({
								data: [
									{ vote_value: "3", users: { name: "John" } },
									{ vote_value: "?", users: { name: "Jane" } },
									{ vote_value: "5", users: { name: "Bob" } },
								],
							}),
						}),
					}),
				});

				// Mock story update
				mockFrom.mockReturnValueOnce({
					update: jest.fn().mockReturnValue({
						eq: jest.fn().mockResolvedValue({ data: null, error: null }),
					}),
				});

				const request = new Request("http://localhost", {
					method: "POST",
					body: JSON.stringify({ storyId }),
				});

				const response = await POST(request, {
					params: Promise.resolve({ sessionId }),
				});

				// Mean of 3, 5 = 4, rounded up = 4, nearest fibonacci >= 4 = 5
				expect(response).toEqual({
					data: {
						finalScore: "5",
						votes: {
							John: "3",
							Jane: "?",
							Bob: "5",
						},
					},
					init: undefined,
				});
			});

			it("should return ? if all votes are question marks", async () => {
				// Mock session lookup
				mockFrom.mockReturnValueOnce({
					select: jest.fn().mockReturnValue({
						eq: jest.fn().mockReturnValue({
							single: jest.fn().mockResolvedValue({
								data: { estimation_type: "fibonacci" },
							}),
						}),
					}),
				});

				// Mock votes lookup
				mockFrom.mockReturnValueOnce({
					select: jest.fn().mockReturnValue({
						eq: jest.fn().mockReturnValue({
							neq: jest.fn().mockResolvedValue({
								data: [
									{ vote_value: "?", users: { name: "John" } },
									{ vote_value: "?", users: { name: "Jane" } },
								],
							}),
						}),
					}),
				});

				// Mock story update
				mockFrom.mockReturnValueOnce({
					update: jest.fn().mockReturnValue({
						eq: jest.fn().mockResolvedValue({ data: null, error: null }),
					}),
				});

				const request = new Request("http://localhost", {
					method: "POST",
					body: JSON.stringify({ storyId }),
				});

				const response = await POST(request, {
					params: Promise.resolve({ sessionId }),
				});

				expect(response).toEqual({
					data: {
						finalScore: "?",
						votes: {
							John: "?",
							Jane: "?",
						},
					},
					init: undefined,
				});
			});
		});

		describe("T-Shirt size estimation", () => {
			it("should calculate mean and map to t-shirt sizes", async () => {
				// Mock session lookup
				mockFrom.mockReturnValueOnce({
					select: jest.fn().mockReturnValue({
						eq: jest.fn().mockReturnValue({
							single: jest.fn().mockResolvedValue({
								data: { estimation_type: "tshirt" },
							}),
						}),
					}),
				});

				// Mock votes lookup
				mockFrom.mockReturnValueOnce({
					select: jest.fn().mockReturnValue({
						eq: jest.fn().mockReturnValue({
							neq: jest.fn().mockResolvedValue({
								data: [
									{ vote_value: "S", users: { name: "John" } }, // 2
									{ vote_value: "M", users: { name: "Jane" } }, // 3
									{ vote_value: "L", users: { name: "Bob" } }, // 4
								],
							}),
						}),
					}),
				});

				// Mock story update
				mockFrom.mockReturnValueOnce({
					update: jest.fn().mockReturnValue({
						eq: jest.fn().mockResolvedValue({ data: null, error: null }),
					}),
				});

				const request = new Request("http://localhost", {
					method: "POST",
					body: JSON.stringify({ storyId }),
				});

				const response = await POST(request, {
					params: Promise.resolve({ sessionId }),
				});

				// Mean of 2, 3, 4 = 3, rounded up = 3, maps to M (index 2, 0-based)
				expect(response).toEqual({
					data: {
						finalScore: "M",
						votes: {
							John: "S",
							Jane: "M",
							Bob: "L",
						},
					},
					init: undefined,
				});
			});
		});

		describe("1-10 estimation", () => {
			it("should calculate mean and round up for 1-10 values", async () => {
				// Mock session lookup
				mockFrom.mockReturnValueOnce({
					select: jest.fn().mockReturnValue({
						eq: jest.fn().mockReturnValue({
							single: jest.fn().mockResolvedValue({
								data: { estimation_type: "oneToTen" },
							}),
						}),
					}),
				});

				// Mock votes lookup
				mockFrom.mockReturnValueOnce({
					select: jest.fn().mockReturnValue({
						eq: jest.fn().mockReturnValue({
							neq: jest.fn().mockResolvedValue({
								data: [
									{ vote_value: "3", users: { name: "John" } },
									{ vote_value: "4", users: { name: "Jane" } },
									{ vote_value: "6", users: { name: "Bob" } },
								],
							}),
						}),
					}),
				});

				// Mock story update
				mockFrom.mockReturnValueOnce({
					update: jest.fn().mockReturnValue({
						eq: jest.fn().mockResolvedValue({ data: null, error: null }),
					}),
				});

				const request = new Request("http://localhost", {
					method: "POST",
					body: JSON.stringify({ storyId }),
				});

				const response = await POST(request, {
					params: Promise.resolve({ sessionId }),
				});

				// Mean of 3, 4, 6 = 4.33, rounded up = 5
				expect(response).toEqual({
					data: {
						finalScore: "5",
						votes: {
							John: "3",
							Jane: "4",
							Bob: "6",
						},
					},
					init: undefined,
				});
			});
		});

		it("should handle anonymous users in votes", async () => {
			// Mock session lookup
			mockFrom.mockReturnValueOnce({
				select: jest.fn().mockReturnValue({
					eq: jest.fn().mockReturnValue({
						single: jest.fn().mockResolvedValue({
							data: { estimation_type: "fibonacci" },
						}),
					}),
				}),
			});

			// Mock votes lookup with anonymous users
			mockFrom.mockReturnValueOnce({
				select: jest.fn().mockReturnValue({
					eq: jest.fn().mockReturnValue({
						neq: jest.fn().mockResolvedValue({
							data: [
								{ vote_value: "3", users: { name: "John" } },
								{
									vote_value: "5",
									users: null,
									anonymous_users: { display_name: "Guest123" },
								},
							],
						}),
					}),
				}),
			});

			// Mock story update
			mockFrom.mockReturnValueOnce({
				update: jest.fn().mockReturnValue({
					eq: jest.fn().mockResolvedValue({ data: null, error: null }),
				}),
			});

			const request = new Request("http://localhost", {
				method: "POST",
				body: JSON.stringify({ storyId }),
			});

			const response = await POST(request, {
				params: Promise.resolve({ sessionId }),
			});

			expect(response).toEqual({
				data: {
					finalScore: "5",
					votes: {
						John: "3",
						Guest123: "5",
					},
				},
				init: undefined,
			});
		});

		it("should return 404 if no votes found", async () => {
			// Mock session lookup
			mockFrom.mockReturnValueOnce({
				select: jest.fn().mockReturnValue({
					eq: jest.fn().mockReturnValue({
						single: jest.fn().mockResolvedValue({
							data: { estimation_type: "fibonacci" },
						}),
					}),
				}),
			});

			// Mock votes lookup - no votes
			mockFrom.mockReturnValueOnce({
				select: jest.fn().mockReturnValue({
					eq: jest.fn().mockReturnValue({
						neq: jest.fn().mockResolvedValue({
							data: [],
						}),
					}),
				}),
			});

			const request = new Request("http://localhost", {
				method: "POST",
				body: JSON.stringify({ storyId }),
			});

			const response = await POST(request, {
				params: Promise.resolve({ sessionId }),
			});

			expect(response).toEqual({
				data: { error: "No votes found for this story" },
				init: { status: 404 },
			});
		});
	});
});
