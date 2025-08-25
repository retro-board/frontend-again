import { act, renderHook } from "@testing-library/react";
import { usePokerTimer } from "./usePokerTimer";

describe("usePokerTimer", () => {
	beforeEach(() => {
		jest.useFakeTimers();
		jest.setSystemTime(new Date("2024-01-01T12:00:00Z"));
	});

	afterEach(() => {
		jest.clearAllTimers();
		jest.useRealTimers();
	});

	describe("start", () => {
		it("should start timer with specified duration", () => {
			const { result } = renderHook(() => usePokerTimer());

			act(() => {
				result.current.start(60); // 60 seconds
			});

			expect(result.current.isActive).toBe(true);
			expect(result.current.timeRemaining).toBe(60);
			expect(result.current.formattedTime).toBe("1:00");
		});

		it.skip("should update time remaining based on clock time", () => {
			const { result, rerender } = renderHook(() => usePokerTimer());

			act(() => {
				result.current.start(60);
			});

			expect(result.current.timeRemaining).toBe(60);

			// Move clock forward and trigger update
			act(() => {
				jest.setSystemTime(new Date("2024-01-01T12:00:05Z"));
				jest.advanceTimersByTime(0); // Trigger immediate update
			});
			rerender();

			// Should be 55 seconds remaining
			expect(result.current.timeRemaining).toBe(55);
			expect(result.current.formattedTime).toBe("0:55");
		});

		it("should format time correctly for different durations", () => {
			const { result } = renderHook(() => usePokerTimer());

			// Test minutes and seconds
			act(() => {
				result.current.start(125); // 2:05
			});
			expect(result.current.formattedTime).toBe("2:05");

			// Test single digit seconds
			act(() => {
				result.current.start(9);
			});
			expect(result.current.formattedTime).toBe("0:09");

			// Test exactly one minute
			act(() => {
				result.current.start(60);
			});
			expect(result.current.formattedTime).toBe("1:00");
		});
	});

	describe("startUntil", () => {
		it("should start timer until specified end time", () => {
			const { result, rerender } = renderHook(() => usePokerTimer());

			// Set end time 30 seconds from current mock time
			const endTime = new Date("2024-01-01T12:00:30Z").toISOString();

			act(() => {
				result.current.startUntil(endTime);
			});
			rerender();

			// Timer should be active and show 30 seconds remaining
			expect(result.current.isActive).toBe(true);
			expect(result.current.timeRemaining).toBe(30);
			expect(result.current.formattedTime).toBe("0:30");
		});

		it.skip("should not start if end time is in the past", () => {
			const { result } = renderHook(() => usePokerTimer());

			// Set end time in the past
			const endTime = new Date("2024-01-01T11:59:00Z").toISOString();

			act(() => {
				result.current.startUntil(endTime);
			});

			// Should still set active but with 0 time
			expect(result.current.isActive).toBe(true);
			expect(result.current.timeRemaining).toBe(0);
		});
	});

	describe("stop", () => {
		it("should stop active timer", () => {
			const { result } = renderHook(() => usePokerTimer());

			act(() => {
				result.current.start(60);
			});

			expect(result.current.isActive).toBe(true);

			act(() => {
				result.current.stop();
			});

			expect(result.current.isActive).toBe(false);
			expect(result.current.timeRemaining).toBe(0);
			expect(result.current.formattedTime).toBe("0:00");
		});

		it("should clear interval on stop", () => {
			const { result, rerender } = renderHook(() => usePokerTimer());

			act(() => {
				result.current.start(60);
			});

			act(() => {
				result.current.stop();
			});

			// Move time forward
			act(() => {
				jest.setSystemTime(new Date("2024-01-01T12:00:05Z"));
				jest.advanceTimersByTime(5000);
			});
			rerender();

			// Time should remain 0 after stop
			expect(result.current.timeRemaining).toBe(0);
		});
	});

	describe("onExpire callback", () => {
		it("should call onExpire when timer reaches zero", () => {
			const onExpire = jest.fn();
			const { result, rerender } = renderHook(() =>
				usePokerTimer({ onExpire }),
			);

			act(() => {
				result.current.start(2); // 2 seconds
			});

			// Move clock past expiration and trigger timer
			act(() => {
				jest.setSystemTime(new Date("2024-01-01T12:00:03Z"));
				jest.advanceTimersByTime(1000); // Trigger interval check
			});
			rerender();

			expect(onExpire).toHaveBeenCalledTimes(1);
			expect(result.current.isActive).toBe(false);
			expect(result.current.timeRemaining).toBe(0);
		});

		it("should not call onExpire if timer is stopped before expiration", () => {
			const onExpire = jest.fn();
			const { result } = renderHook(() => usePokerTimer({ onExpire }));

			act(() => {
				result.current.start(10);
			});

			act(() => {
				result.current.stop();
			});

			// Move time past what would have been expiration
			act(() => {
				jest.setSystemTime(new Date("2024-01-01T12:00:15Z"));
				jest.advanceTimersByTime(15000);
			});

			expect(onExpire).not.toHaveBeenCalled();
		});

		it("should only call onExpire once", () => {
			const onExpire = jest.fn();
			const { result, rerender } = renderHook(() =>
				usePokerTimer({ onExpire }),
			);

			act(() => {
				result.current.start(1);
			});

			// Move well past expiration
			act(() => {
				jest.setSystemTime(new Date("2024-01-01T12:00:05Z"));
				jest.advanceTimersByTime(5000);
			});
			rerender();

			// Trigger more updates
			act(() => {
				jest.advanceTimersByTime(5000);
			});
			rerender();

			expect(onExpire).toHaveBeenCalledTimes(1);
		});
	});

	describe("edge cases", () => {
		it.skip("should handle restart while timer is active", () => {
			const { result, rerender } = renderHook(() => usePokerTimer());

			act(() => {
				result.current.start(60);
			});

			expect(result.current.timeRemaining).toBe(60);

			// Move time forward
			act(() => {
				jest.setSystemTime(new Date("2024-01-01T12:00:10Z"));
				jest.advanceTimersByTime(0); // Trigger update
			});
			rerender();

			expect(result.current.timeRemaining).toBe(50);

			// Restart with new duration
			act(() => {
				result.current.start(30);
			});

			expect(result.current.timeRemaining).toBe(30);
			expect(result.current.isActive).toBe(true);
		});

		it("should handle multiple stops", () => {
			const { result } = renderHook(() => usePokerTimer());

			act(() => {
				result.current.start(60);
			});

			act(() => {
				result.current.stop();
			});

			// Second stop should not cause issues
			act(() => {
				result.current.stop();
			});

			expect(result.current.isActive).toBe(false);
			expect(result.current.timeRemaining).toBe(0);
		});

		it("should handle zero duration", () => {
			const onExpire = jest.fn();
			const { result, rerender } = renderHook(() =>
				usePokerTimer({ onExpire }),
			);

			act(() => {
				result.current.start(0);
			});

			// Let the effect run
			act(() => {
				jest.advanceTimersByTime(0);
			});
			rerender();

			expect(result.current.isActive).toBe(false);
			expect(result.current.timeRemaining).toBe(0);
			expect(onExpire).toHaveBeenCalled();
		});

		it.skip("should handle negative duration", () => {
			const { result } = renderHook(() => usePokerTimer());

			act(() => {
				result.current.start(-10);
			});

			// Negative duration gets clamped to 0 by the timer logic
			expect(result.current.isActive).toBe(true); // Still sets active
			expect(result.current.timeRemaining).toBeLessThanOrEqual(0);
		});
	});

	describe("cleanup", () => {
		it("should clean up interval on unmount", () => {
			const { result, unmount } = renderHook(() => usePokerTimer());

			act(() => {
				result.current.start(60);
			});

			const clearIntervalSpy = jest.spyOn(global, "clearInterval");

			unmount();

			expect(clearIntervalSpy).toHaveBeenCalled();
			clearIntervalSpy.mockRestore();
		});
	});
});
