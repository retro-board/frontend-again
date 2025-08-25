import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { PokerChannelClient } from "./poker-channel";

// Mock Supabase client
const mockChannel = {
	on: jest.fn().mockReturnThis(),
	subscribe: jest.fn().mockResolvedValue({ status: "SUBSCRIBED" }),
	unsubscribe: jest.fn().mockResolvedValue({ status: "ok" }),
	send: jest.fn().mockResolvedValue({ status: "ok" }),
	track: jest.fn().mockResolvedValue({ status: "ok" }),
	presenceState: jest.fn().mockReturnValue({}),
} as unknown as RealtimeChannel;

const mockSupabase = {
	channel: jest.fn().mockReturnValue(mockChannel),
} as unknown as SupabaseClient;

describe("PokerChannelClient", () => {
	let client: PokerChannelClient;
	const sessionId = "test-session-123";
	const userId = "user-123";
	const anonymousUserId = "anon-123";

	beforeEach(() => {
		jest.clearAllMocks();
		client = new PokerChannelClient(sessionId, mockSupabase);
	});

	describe("connect", () => {
		it("should create and subscribe to a channel", async () => {
			await client.connect(userId);

			expect(mockSupabase.channel).toHaveBeenCalledWith(
				`poker:${sessionId}`,
				expect.objectContaining({
					config: {
						presence: {
							key: userId,
						},
					},
				}),
			);
			expect(mockChannel.subscribe).toHaveBeenCalled();
		});

		it("should track presence for authenticated user", async () => {
			await client.connect(userId);

			expect(mockChannel.track).toHaveBeenCalledWith(
				expect.objectContaining({
					userId,
					online_at: expect.any(String),
				}),
			);
		});

		it("should track presence for anonymous user", async () => {
			await client.connect(undefined, anonymousUserId);

			expect(mockChannel.track).toHaveBeenCalledWith(
				expect.objectContaining({
					anonymousUserId,
					online_at: expect.any(String),
				}),
			);
		});

		it("should disconnect existing channel before connecting new one", async () => {
			await client.connect(userId);
			await client.connect(userId);

			expect(mockChannel.unsubscribe).toHaveBeenCalledTimes(1);
		});
	});

	describe("disconnect", () => {
		it("should unsubscribe from channel", async () => {
			await client.connect(userId);
			await client.disconnect();

			expect(mockChannel.unsubscribe).toHaveBeenCalled();
		});

		it("should handle disconnect when not connected", async () => {
			await expect(client.disconnect()).resolves.not.toThrow();
		});
	});

	describe("sendMessage", () => {
		it("should send broadcast message through channel", async () => {
			await client.connect(userId);
			const message = {
				type: "vote" as const,
				sessionId,
				storyId: "story-123",
				voteValue: "5",
				userId,
				timestamp: new Date().toISOString(),
			};

			await client.sendMessage(message);

			expect(mockChannel.send).toHaveBeenCalledWith({
				type: "broadcast",
				event: "poker_message",
				payload: message,
			});
		});

		it("should throw error if channel not connected", async () => {
			const message = {
				type: "vote" as const,
				sessionId,
				storyId: "story-123",
				voteValue: "5",
				userId,
				timestamp: new Date().toISOString(),
			};

			await expect(client.sendMessage(message)).rejects.toThrow(
				"Channel not connected",
			);
		});
	});

	describe("message handlers", () => {
		it("should register and trigger message handler", async () => {
			await client.connect(userId);
			const handler = jest.fn();
			const unsubscribe = client.onMessage(handler);

			// Simulate receiving a message
			const messageCallback = (mockChannel.on as jest.Mock).mock.calls.find(
				(call) => call[0] === "broadcast" && call[1].event === "poker_message",
			)[2];

			const testMessage = {
				payload: {
					type: "vote",
					sessionId,
					storyId: "story-123",
					voteValue: "5",
					userId,
					timestamp: new Date().toISOString(),
				},
			};

			messageCallback(testMessage);

			expect(handler).toHaveBeenCalledWith(testMessage.payload);

			// Test unsubscribe
			unsubscribe();
			messageCallback(testMessage);
			expect(handler).toHaveBeenCalledTimes(1); // Should not be called again
		});

		it("should handle multiple message handlers", async () => {
			await client.connect(userId);
			const handler1 = jest.fn();
			const handler2 = jest.fn();

			client.onMessage(handler1);
			client.onMessage(handler2);

			// Simulate receiving a message
			const messageCallback = (mockChannel.on as jest.Mock).mock.calls.find(
				(call) => call[0] === "broadcast" && call[1].event === "poker_message",
			)[2];

			const testMessage = {
				payload: {
					type: "vote",
					sessionId,
					storyId: "story-123",
					voteValue: "5",
					userId,
					timestamp: new Date().toISOString(),
				},
			};

			messageCallback(testMessage);

			expect(handler1).toHaveBeenCalledWith(testMessage.payload);
			expect(handler2).toHaveBeenCalledWith(testMessage.payload);
		});
	});

	describe("helper methods", () => {
		beforeEach(async () => {
			await client.connect(userId);
		});

		it("should send vote message", async () => {
			await client.vote("story-123", "5", userId, undefined, "John Doe");

			expect(mockChannel.send).toHaveBeenCalledWith({
				type: "broadcast",
				event: "poker_message",
				payload: expect.objectContaining({
					type: "vote",
					sessionId,
					storyId: "story-123",
					voteValue: "5",
					userId,
					userName: "John Doe",
				}),
			});
		});

		it("should send join message", async () => {
			await client.join("voter", userId, undefined, "John Doe");

			expect(mockChannel.send).toHaveBeenCalledWith({
				type: "broadcast",
				event: "poker_message",
				payload: expect.objectContaining({
					type: "join",
					sessionId,
					role: "voter",
					userId,
					userName: "John Doe",
				}),
			});
		});

		it("should send leave message", async () => {
			await client.leave(userId, undefined, "John Doe");

			expect(mockChannel.send).toHaveBeenCalledWith({
				type: "broadcast",
				event: "poker_message",
				payload: expect.objectContaining({
					type: "leave",
					sessionId,
					userId,
					userName: "John Doe",
				}),
			});
		});

		it("should send abstain message", async () => {
			await client.abstain(userId, undefined, "John Doe");

			expect(mockChannel.send).toHaveBeenCalledWith({
				type: "broadcast",
				event: "poker_message",
				payload: expect.objectContaining({
					type: "abstain",
					sessionId,
					userId,
					userName: "John Doe",
				}),
			});
		});

		it("should send unabstain message", async () => {
			await client.unabstain(userId, undefined, "John Doe");

			expect(mockChannel.send).toHaveBeenCalledWith({
				type: "broadcast",
				event: "poker_message",
				payload: expect.objectContaining({
					type: "unabstain",
					sessionId,
					userId,
					userName: "John Doe",
				}),
			});
		});

		describe("facilitator methods", () => {
			it("should send timer start message", async () => {
				await client.startTimer(60, userId);

				expect(mockChannel.send).toHaveBeenCalledWith({
					type: "broadcast",
					event: "poker_message",
					payload: expect.objectContaining({
						type: "timer_start",
						sessionId,
						userId,
						duration: 60,
						endsAt: expect.any(String),
					}),
				});
			});

			it("should send timer stop message", async () => {
				await client.stopTimer(userId);

				expect(mockChannel.send).toHaveBeenCalledWith({
					type: "broadcast",
					event: "poker_message",
					payload: expect.objectContaining({
						type: "timer_stop",
						sessionId,
						userId,
					}),
				});
			});

			it("should send story create message", async () => {
				const story = {
					id: "story-123",
					title: "Test Story",
					description: "Test Description",
					position: 1,
				};

				await client.createStory(story, userId);

				expect(mockChannel.send).toHaveBeenCalledWith({
					type: "broadcast",
					event: "poker_message",
					payload: expect.objectContaining({
						type: "story_create",
						sessionId,
						userId,
						story,
					}),
				});
			});

			it("should send story select message", async () => {
				await client.selectStory("story-123", "Test Story", userId);

				expect(mockChannel.send).toHaveBeenCalledWith({
					type: "broadcast",
					event: "poker_message",
					payload: expect.objectContaining({
						type: "story_select",
						sessionId,
						userId,
						storyId: "story-123",
						storyTitle: "Test Story",
					}),
				});
			});

			it("should send voting start message", async () => {
				await client.startVoting("story-123", userId);

				expect(mockChannel.send).toHaveBeenCalledWith({
					type: "broadcast",
					event: "poker_message",
					payload: expect.objectContaining({
						type: "voting_start",
						sessionId,
						userId,
						storyId: "story-123",
					}),
				});
			});

			it("should send voting end message", async () => {
				await client.endVoting("story-123", userId);

				expect(mockChannel.send).toHaveBeenCalledWith({
					type: "broadcast",
					event: "poker_message",
					payload: expect.objectContaining({
						type: "voting_end",
						sessionId,
						userId,
						storyId: "story-123",
					}),
				});
			});

			it("should send score announcement message", async () => {
				const votes = {
					"John Doe": "5",
					"Jane Smith": "8",
				};

				await client.announceScore("story-123", "5", votes, userId);

				expect(mockChannel.send).toHaveBeenCalledWith({
					type: "broadcast",
					event: "poker_message",
					payload: expect.objectContaining({
						type: "score_calculated",
						sessionId,
						userId,
						storyId: "story-123",
						finalScore: "5",
						votes,
					}),
				});
			});
		});
	});

	describe("presence sync", () => {
		it("should register and trigger presence handler", async () => {
			await client.connect(userId);
			const handler = jest.fn();
			const unsubscribe = client.onPresenceSync(handler);

			// Simulate presence sync
			const presenceCallback = (mockChannel.on as jest.Mock).mock.calls.find(
				(call) => call[0] === "presence" && call[1].event === "sync",
			)[2];

			const testState = { user1: { online_at: "2024-01-01" } };
			(mockChannel.presenceState as jest.Mock).mockReturnValue(testState);

			presenceCallback();

			expect(handler).toHaveBeenCalledWith(testState);

			// Test unsubscribe
			unsubscribe();
			presenceCallback();
			expect(handler).toHaveBeenCalledTimes(1); // Should not be called again
		});
	});
});
