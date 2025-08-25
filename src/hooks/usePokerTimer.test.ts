import { act, renderHook } from "@testing-library/react";
import { usePokerTimer } from "./usePokerTimer";

// Mock timers
jest.useFakeTimers();

describe("usePokerTimer", () => {
	beforeEach(() => {
		jest.clearAllTimers();
		jest.setSystemTime(new Date("2024-01-01T12:00:00Z"));
	});

	afterEach(() => {
		jest.runOnlyPendingTimers();
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

		it("should update time remaining every second", () => {
			const { result } = renderHook(() => usePokerTimer());

			act(() => {
				result.current.start(60);
			});

			act(() => {
				jest.advanceTimersByTime(1000); // Advance 1 second
			});

			expect(result.current.timeRemaining).toBe(59);
			expect(result.current.formattedTime).toBe("0:59");

			act(() => {
				jest.advanceTimersByTime(5000); // Advance 5 more seconds
			});

			expect(result.current.timeRemaining).toBe(54);
			expect(result.current.formattedTime).toBe("0:54");
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
			const { result } = renderHook(() => usePokerTimer());

			// Set end time 30 seconds from now
			const endTime = new Date("2024-01-01T12:00:30Z").toISOString();

			act(() => {
				result.current.startUntil(endTime);
			});

			expect(result.current.isActive).toBe(true);
			expect(result.current.timeRemaining).toBe(30);
			expect(result.current.formattedTime).toBe("0:30");
		});

		it("should not start if end time is in the past", () => {
			const { result } = renderHook(() => usePokerTimer());

			// Set end time in the past
			const endTime = new Date("2024-01-01T11:59:00Z").toISOString();

			act(() => {
				result.current.startUntil(endTime);
			});

			expect(result.current.isActive).toBe(false);
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
			const { result } = renderHook(() => usePokerTimer());

			act(() => {
				result.current.start(60);
			});

			const initialTime = result.current.timeRemaining;

			act(() => {
				result.current.stop();
			});

			act(() => {
				jest.advanceTimersByTime(5000); // Advance 5 seconds
			});

			// Time should not change after stop
			expect(result.current.timeRemaining).toBe(0);
		});
	});

	describe("onExpire callback", () => {
		it("should call onExpire when timer reaches zero", () => {
			const onExpire = jest.fn();
			const { result } = renderHook(() => usePokerTimer({ onExpire }));

			act(() => {
				result.current.start(3); // 3 seconds
			});

			act(() => {
				jest.advanceTimersByTime(3000); // Advance to expiration
			});

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
				jest.advanceTimersByTime(5000); // Advance halfway
			});

			act(() => {
				result.current.stop();
			});

			act(() => {
				jest.advanceTimersByTime(10000); // Advance past original expiration
			});

			expect(onExpire).not.toHaveBeenCalled();
		});

		it("should only call onExpire once even if timer continues", () => {
			const onExpire = jest.fn();
			const { result } = renderHook(() => usePokerTimer({ onExpire }));

			act(() => {
				result.current.start(2);
			});

			act(() => {
				jest.advanceTimersByTime(5000); // Advance well past expiration
			});

			expect(onExpire).toHaveBeenCalledTimes(1);
		});
	});

	describe("edge cases", () => {
		it("should handle restart while timer is active", () => {
			const { result } = renderHook(() => usePokerTimer());

			act(() => {
				result.current.start(60);
			});

			act(() => {
				jest.advanceTimersByTime(10000); // Advance 10 seconds
			});

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
			const { result } = renderHook(() => usePokerTimer({ onExpire }));

			act(() => {
				result.current.start(0);
			});

			expect(result.current.isActive).toBe(false);
			expect(result.current.timeRemaining).toBe(0);
			expect(onExpire).toHaveBeenCalled();
		});

		it("should handle negative duration", () => {
			const { result } = renderHook(() => usePokerTimer());

			act(() => {
				result.current.start(-10);
			});

			expect(result.current.isActive).toBe(false);
			expect(result.current.timeRemaining).toBe(0);
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
		});
	});
});
