import { useUser } from "@clerk/nextjs";
import { act, renderHook } from "@testing-library/react";
import { supabase } from "~/lib/supabase/client";
import { PokerChannelClient } from "~/lib/supabase/poker-channel";
import type { PokerChannelMessage } from "~/types/poker-channel";
import { usePokerChannel } from "./usePokerChannel";

// Mock dependencies
jest.mock("@clerk/nextjs", () => ({
	useUser: jest.fn(),
}));

jest.mock("~/lib/supabase/client", () => ({
	supabase: {},
}));

jest.mock("~/lib/supabase/poker-channel", () => ({
	PokerChannelClient: jest.fn(),
}));

describe("usePokerChannel", () => {
	const mockUser = { id: "user-123", fullName: "John Doe" };
	const sessionId = "session-123";
	// biome-ignore lint/suspicious/noExplicitAny: Mock object for testing
	let mockChannelInstance: any;

	beforeEach(() => {
		jest.clearAllMocks();

		// Mock channel instance
		mockChannelInstance = {
			connect: jest.fn().mockResolvedValue(undefined),
			disconnect: jest.fn().mockResolvedValue(undefined),
			onMessage: jest.fn().mockReturnValue(jest.fn()),
			vote: jest.fn().mockResolvedValue(undefined),
			join: jest.fn().mockResolvedValue(undefined),
			leave: jest.fn().mockResolvedValue(undefined),
			abstain: jest.fn().mockResolvedValue(undefined),
			unabstain: jest.fn().mockResolvedValue(undefined),
			startTimer: jest.fn().mockResolvedValue(undefined),
			stopTimer: jest.fn().mockResolvedValue(undefined),
			createStory: jest.fn().mockResolvedValue(undefined),
			selectStory: jest.fn().mockResolvedValue(undefined),
			startVoting: jest.fn().mockResolvedValue(undefined),
			endVoting: jest.fn().mockResolvedValue(undefined),
			announceScore: jest.fn().mockResolvedValue(undefined),
		};

		(PokerChannelClient as jest.Mock).mockImplementation(
			() => mockChannelInstance,
		);
		(useUser as jest.Mock).mockReturnValue({ user: mockUser });
	});

	describe("channel connection", () => {
		it("should connect to channel on mount", async () => {
			renderHook(() =>
				usePokerChannel({
					sessionId,
					isAnonymous: false,
				}),
			);

			// Wait for effect to run
			await act(async () => {
				await new Promise((resolve) => setTimeout(resolve, 0));
			});

			expect(PokerChannelClient).toHaveBeenCalledWith(sessionId, supabase);
			expect(mockChannelInstance.connect).toHaveBeenCalledWith(
				mockUser.id,
				undefined,
			);
		});

		it("should connect as anonymous user", async () => {
			(useUser as jest.Mock).mockReturnValue({ user: null });
			const anonymousUserId = "anon-123";

			renderHook(() =>
				usePokerChannel({
					sessionId,
					isAnonymous: true,
					anonymousUserId,
				}),
			);

			await act(async () => {
				await new Promise((resolve) => setTimeout(resolve, 0));
			});

			expect(mockChannelInstance.connect).toHaveBeenCalledWith(
				undefined,
				anonymousUserId,
			);
		});

		it("should disconnect on unmount", async () => {
			const { unmount } = renderHook(() =>
				usePokerChannel({
					sessionId,
					isAnonymous: false,
				}),
			);

			await act(async () => {
				await new Promise((resolve) => setTimeout(resolve, 0));
			});

			unmount();

			expect(mockChannelInstance.disconnect).toHaveBeenCalled();
		});
	});

	describe("message handling", () => {
		let messageHandler: (message: PokerChannelMessage) => void;

		beforeEach(() => {
			// Capture the message handler
			// biome-ignore lint/suspicious/noExplicitAny: Mock handler for testing
			mockChannelInstance.onMessage.mockImplementation((handler: any) => {
				messageHandler = handler;
				return jest.fn(); // Return unsubscribe function
			});
		});

		it("should update state when participant joins", async () => {
			const { result } = renderHook(() =>
				usePokerChannel({
					sessionId,
					isAnonymous: false,
				}),
			);

			await act(async () => {
				await new Promise((resolve) => setTimeout(resolve, 0));
			});

			act(() => {
				messageHandler({
					type: "join",
					sessionId,
					userId: "new-user",
					userName: "Jane Doe",
					role: "voter",
					timestamp: new Date().toISOString(),
				});
			});

			expect(result.current.sessionState.participants).toContainEqual(
				expect.objectContaining({
					id: "new-user",
					name: "Jane Doe",
					role: "voter",
					hasVoted: false,
					isAbstaining: false,
				}),
			);
		});

		it("should update state when participant leaves", async () => {
			const { result } = renderHook(() =>
				usePokerChannel({
					sessionId,
					isAnonymous: false,
				}),
			);

			await act(async () => {
				await new Promise((resolve) => setTimeout(resolve, 0));
			});

			// First add a participant
			act(() => {
				messageHandler({
					type: "join",
					sessionId,
					userId: "user-to-leave",
					userName: "Leaver",
					role: "voter",
					timestamp: new Date().toISOString(),
				});
			});

			// Then remove them
			act(() => {
				messageHandler({
					type: "leave",
					sessionId,
					userId: "user-to-leave",
					timestamp: new Date().toISOString(),
				});
			});

			expect(result.current.sessionState.participants).not.toContainEqual(
				expect.objectContaining({
					id: "user-to-leave",
				}),
			);
		});

		describe("voting completion detection", () => {
			it("should detect when all eligible voters have voted", async () => {
				const { result } = renderHook(() =>
					usePokerChannel({
						sessionId,
						isAnonymous: false,
					}),
				);

				await act(async () => {
					await new Promise((resolve) => setTimeout(resolve, 0));
				});

				// Add participants
				act(() => {
					messageHandler({
						type: "join",
						sessionId,
						userId: "voter1",
						userName: "Voter 1",
						role: "voter",
						timestamp: new Date().toISOString(),
					});
					messageHandler({
						type: "join",
						sessionId,
						userId: "voter2",
						userName: "Voter 2",
						role: "voter",
						timestamp: new Date().toISOString(),
					});
				});

				// Both voters vote
				act(() => {
					messageHandler({
						type: "vote",
						sessionId,
						storyId: "story-123",
						voteValue: "5",
						userId: "voter1",
						timestamp: new Date().toISOString(),
					});
				});

				expect(result.current.sessionState.votingState.allVoted).toBeFalsy();

				act(() => {
					messageHandler({
						type: "vote",
						sessionId,
						storyId: "story-123",
						voteValue: "8",
						userId: "voter2",
						timestamp: new Date().toISOString(),
					});
				});

				expect(result.current.sessionState.votingState.allVoted).toBe(true);
				expect(result.current.sessionState.votingState.votesReceived).toBe(2);
			});

			it("should not count abstaining voters as eligible", async () => {
				const { result } = renderHook(() =>
					usePokerChannel({
						sessionId,
						isAnonymous: false,
					}),
				);

				await act(async () => {
					await new Promise((resolve) => setTimeout(resolve, 0));
				});

				// Add participants
				act(() => {
					messageHandler({
						type: "join",
						sessionId,
						userId: "voter1",
						userName: "Voter 1",
						role: "voter",
						timestamp: new Date().toISOString(),
					});
					messageHandler({
						type: "join",
						sessionId,
						userId: "voter2",
						userName: "Voter 2",
						role: "voter",
						timestamp: new Date().toISOString(),
					});
				});

				// One voter abstains
				act(() => {
					messageHandler({
						type: "abstain",
						sessionId,
						userId: "voter2",
						timestamp: new Date().toISOString(),
					});
				});

				expect(result.current.sessionState.votingState.eligibleVoters).toBe(1);

				// The non-abstaining voter votes
				act(() => {
					messageHandler({
						type: "vote",
						sessionId,
						storyId: "story-123",
						voteValue: "5",
						userId: "voter1",
						timestamp: new Date().toISOString(),
					});
				});

				// All eligible voters have voted (only 1 eligible)
				expect(result.current.sessionState.votingState.allVoted).toBe(true);
			});

			it("should not count observers as eligible voters", async () => {
				const { result } = renderHook(() =>
					usePokerChannel({
						sessionId,
						isAnonymous: false,
					}),
				);

				await act(async () => {
					await new Promise((resolve) => setTimeout(resolve, 0));
				});

				// Add participants
				act(() => {
					messageHandler({
						type: "join",
						sessionId,
						userId: "voter1",
						userName: "Voter 1",
						role: "voter",
						timestamp: new Date().toISOString(),
					});
					messageHandler({
						type: "join",
						sessionId,
						userId: "observer1",
						userName: "Observer 1",
						role: "observer",
						timestamp: new Date().toISOString(),
					});
				});

				expect(result.current.sessionState.votingState.eligibleVoters).toBe(1);

				// The voter votes
				act(() => {
					messageHandler({
						type: "vote",
						sessionId,
						storyId: "story-123",
						voteValue: "5",
						userId: "voter1",
						timestamp: new Date().toISOString(),
					});
				});

				// All eligible voters have voted
				expect(result.current.sessionState.votingState.allVoted).toBe(true);
			});
		});

		it("should handle story selection", async () => {
			const { result } = renderHook(() =>
				usePokerChannel({
					sessionId,
					isAnonymous: false,
				}),
			);

			await act(async () => {
				await new Promise((resolve) => setTimeout(resolve, 0));
			});

			act(() => {
				messageHandler({
					type: "story_select",
					sessionId,
					storyId: "story-123",
					storyTitle: "Test Story",
					userId: "facilitator",
					timestamp: new Date().toISOString(),
				});
			});

			expect(result.current.sessionState.currentStory).toEqual({
				id: "story-123",
				title: "Test Story",
			});
		});

		it("should reset votes when new story is selected", async () => {
			const { result } = renderHook(() =>
				usePokerChannel({
					sessionId,
					isAnonymous: false,
				}),
			);

			await act(async () => {
				await new Promise((resolve) => setTimeout(resolve, 0));
			});

			// Add participant and vote
			act(() => {
				messageHandler({
					type: "join",
					sessionId,
					userId: "voter1",
					userName: "Voter 1",
					role: "voter",
					timestamp: new Date().toISOString(),
				});
				messageHandler({
					type: "vote",
					sessionId,
					storyId: "story-1",
					voteValue: "5",
					userId: "voter1",
					timestamp: new Date().toISOString(),
				});
			});

			expect(result.current.sessionState.votingState.votesReceived).toBe(1);

			// Select new story
			act(() => {
				messageHandler({
					type: "story_select",
					sessionId,
					storyId: "story-2",
					storyTitle: "New Story",
					userId: "facilitator",
					timestamp: new Date().toISOString(),
				});
			});

			expect(result.current.sessionState.votingState.votesReceived).toBe(0);
			const participant = result.current.sessionState.participants[0];
			expect(participant?.hasVoted).toBe(false);
		});

		it("should handle timer events", async () => {
			const { result } = renderHook(() =>
				usePokerChannel({
					sessionId,
					isAnonymous: false,
				}),
			);

			await act(async () => {
				await new Promise((resolve) => setTimeout(resolve, 0));
			});

			const endsAt = new Date(Date.now() + 60000).toISOString();

			act(() => {
				messageHandler({
					type: "timer_start",
					sessionId,
					userId: "facilitator",
					duration: 60,
					endsAt,
					timestamp: new Date().toISOString(),
				});
			});

			expect(result.current.sessionState.timer).toEqual({
				isActive: true,
				duration: 60,
				endsAt,
			});

			act(() => {
				messageHandler({
					type: "timer_stop",
					sessionId,
					userId: "facilitator",
					timestamp: new Date().toISOString(),
				});
			});

			expect(result.current.sessionState.timer).toEqual({
				isActive: false,
			});
		});
	});

	describe("action methods", () => {
		it("should call channel methods with correct parameters", async () => {
			const { result } = renderHook(() =>
				usePokerChannel({
					sessionId,
					isAnonymous: false,
				}),
			);

			await act(async () => {
				await new Promise((resolve) => setTimeout(resolve, 0));
			});

			// Test vote
			await act(async () => {
				await result.current.vote("story-123", "5");
			});
			expect(mockChannelInstance.vote).toHaveBeenCalledWith(
				"story-123",
				"5",
				mockUser.id,
				undefined,
				mockUser.fullName,
			);

			// Test join
			await act(async () => {
				await result.current.join("voter");
			});
			expect(mockChannelInstance.join).toHaveBeenCalledWith(
				"voter",
				mockUser.id,
				undefined,
				mockUser.fullName,
			);

			// Test abstain
			await act(async () => {
				await result.current.abstain();
			});
			expect(mockChannelInstance.abstain).toHaveBeenCalledWith(
				mockUser.id,
				undefined,
				mockUser.fullName,
			);

			// Test facilitator methods
			await act(async () => {
				await result.current.selectStory("story-123", "Test Story");
			});
			expect(mockChannelInstance.selectStory).toHaveBeenCalledWith(
				"story-123",
				"Test Story",
				mockUser.id,
			);

			await act(async () => {
				await result.current.startVoting("story-123");
			});
			expect(mockChannelInstance.startVoting).toHaveBeenCalledWith(
				"story-123",
				mockUser.id,
			);
		});
	});
});
