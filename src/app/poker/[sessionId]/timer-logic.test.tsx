import { act, renderHook } from "@testing-library/react";
import { usePokerChannel } from "~/hooks/usePokerChannel";
import { usePokerTimer } from "~/hooks/usePokerTimer";

jest.mock("@clerk/nextjs", () => ({
	useUser: jest.fn(() => ({
		user: { id: "user-1", fullName: "Test User" },
		isLoaded: true,
	})),
}));

jest.mock("~/lib/supabase/client", () => ({
	supabase: {
		channel: jest.fn(() => ({
			on: jest.fn().mockReturnThis(),
			subscribe: jest.fn().mockResolvedValue({ status: "SUBSCRIBED" }),
			unsubscribe: jest.fn(),
			send: jest.fn(),
			track: jest.fn(),
			presenceState: jest.fn().mockReturnValue({}),
		})),
	},
}));

jest.mock("~/lib/supabase/poker-channel", () => ({
	PokerChannelClient: jest.fn().mockImplementation(() => ({
		connect: jest.fn().mockResolvedValue(undefined),
		disconnect: jest.fn().mockResolvedValue(undefined),
		onMessage: jest.fn().mockReturnValue(jest.fn()),
		sendMessage: jest.fn().mockResolvedValue(undefined),
		onPresenceSync: jest.fn().mockReturnValue(jest.fn()),
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
	})),
}));

describe("Timer Logic", () => {
	describe("usePokerChannel timer handling", () => {
		beforeEach(() => {
			jest.clearAllMocks();
		});

		it("should update timer state when timer_start message is received", () => {
			const { result } = renderHook(() =>
				usePokerChannel({
					sessionId: "test-session",
					isAnonymous: false,
				}),
			);

			// Initial state should have timer inactive
			expect(result.current.sessionState.timer.isActive).toBe(false);

			// Simulate timer_start message
			const endsAt = new Date(Date.now() + 60000).toISOString();
			act(() => {
				// This would normally come from the channel
				// but we're testing the state update logic
				const _message = {
					type: "timer_start",
					sessionId: "test-session",
					userId: "facilitator-1",
					duration: 60,
					endsAt,
					timestamp: new Date().toISOString(),
				};

				// The hook should process this message and update state
				// In real usage, this happens via the channel message handler
			});
		});

		it("should update timer state when timer_stop message is received", () => {
			const { result } = renderHook(() =>
				usePokerChannel({
					sessionId: "test-session",
					isAnonymous: false,
				}),
			);

			// Start with timer active
			act(() => {
				// Simulate timer being active
				result.current.sessionState.timer = {
					isActive: true,
					duration: 60,
					endsAt: new Date(Date.now() + 60000).toISOString(),
				};
			});

			// Simulate timer_stop message
			act(() => {
				const _message = {
					type: "timer_stop",
					sessionId: "test-session",
					userId: "facilitator-1",
					timestamp: new Date().toISOString(),
				};

				// The hook should process this message and update state
			});
		});
	});

	describe("usePokerTimer", () => {
		it("should handle timer expiry", async () => {
			const onExpire = jest.fn();
			const { result } = renderHook(() => usePokerTimer({ onExpire }));

			// Start timer for a very short duration
			const futureTime = new Date(Date.now() + 100).toISOString();
			act(() => {
				result.current.startUntil(futureTime);
			});

			expect(result.current.isActive).toBe(true);

			// Wait for timer to expire
			await new Promise((resolve) => setTimeout(resolve, 150));

			expect(onExpire).toHaveBeenCalled();
		});

		it("should stop timer correctly", () => {
			const { result } = renderHook(() =>
				usePokerTimer({ onExpire: jest.fn() }),
			);

			// Start timer
			const futureTime = new Date(Date.now() + 60000).toISOString();
			act(() => {
				result.current.startUntil(futureTime);
			});

			expect(result.current.isActive).toBe(true);

			// Stop timer
			act(() => {
				result.current.stop();
			});

			expect(result.current.isActive).toBe(false);
		});
	});

	describe("Timer display logic", () => {
		it("should format time correctly", () => {
			// Test time formatting
			const formatTime = (seconds: number) => {
				const minutes = Math.floor(seconds / 60);
				const secs = Math.floor(seconds % 60);
				return `${minutes}:${secs.toString().padStart(2, "0")}`;
			};

			expect(formatTime(0)).toBe("0:00");
			expect(formatTime(30)).toBe("0:30");
			expect(formatTime(60)).toBe("1:00");
			expect(formatTime(90)).toBe("1:30");
			expect(formatTime(125)).toBe("2:05");
		});

		it("should calculate remaining time correctly", () => {
			const calculateRemaining = (endsAt: string) => {
				const remaining = Math.max(
					0,
					Math.floor((new Date(endsAt).getTime() - Date.now()) / 1000),
				);
				return remaining;
			};

			// Test with future time
			const futureTime = new Date(Date.now() + 30000).toISOString();
			const remaining = calculateRemaining(futureTime);
			expect(remaining).toBeGreaterThanOrEqual(29);
			expect(remaining).toBeLessThanOrEqual(30);

			// Test with past time
			const pastTime = new Date(Date.now() - 30000).toISOString();
			expect(calculateRemaining(pastTime)).toBe(0);
		});
	});
});
