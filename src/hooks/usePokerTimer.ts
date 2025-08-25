import { useCallback, useEffect, useRef, useState } from "react";

interface UsePokerTimerOptions {
	onExpire?: () => void;
	autoStop?: boolean;
}

export function usePokerTimer({
	onExpire,
	autoStop = true,
}: UsePokerTimerOptions = {}) {
	const [isActive, setIsActive] = useState(false);
	const [timeRemaining, setTimeRemaining] = useState(0);
	const [endsAt, setEndsAt] = useState<Date | null>(null);
	const intervalRef = useRef<NodeJS.Timeout | null>(null);
	const expiredRef = useRef(false);

	// Start timer with duration in seconds
	const start = useCallback((duration: number) => {
		expiredRef.current = false;
		setIsActive(true);
		setTimeRemaining(duration);
		setEndsAt(new Date(Date.now() + duration * 1000));
	}, []);

	// Start timer with specific end time
	const startUntil = useCallback((endTime: Date | string) => {
		const end = typeof endTime === "string" ? new Date(endTime) : endTime;
		const now = new Date();
		const remaining = Math.max(
			0,
			Math.floor((end.getTime() - now.getTime()) / 1000),
		);

		expiredRef.current = false;
		setIsActive(true);
		setTimeRemaining(remaining);
		setEndsAt(end);
	}, []);

	// Stop timer
	const stop = useCallback(() => {
		setIsActive(false);
		setTimeRemaining(0);
		setEndsAt(null);
		expiredRef.current = false;

		if (intervalRef.current) {
			clearInterval(intervalRef.current);
			intervalRef.current = null;
		}
	}, []);

	// Update timer
	useEffect(() => {
		if (!isActive || !endsAt) {
			if (intervalRef.current) {
				clearInterval(intervalRef.current);
				intervalRef.current = null;
			}
			return;
		}

		const updateTimer = () => {
			const now = new Date();
			const remaining = Math.max(
				0,
				Math.floor((endsAt.getTime() - now.getTime()) / 1000),
			);

			setTimeRemaining(remaining);

			if (remaining === 0 && !expiredRef.current) {
				expiredRef.current = true;

				if (autoStop) {
					setIsActive(false);
				}

				onExpire?.();

				if (intervalRef.current) {
					clearInterval(intervalRef.current);
					intervalRef.current = null;
				}
			}
		};

		// Update immediately
		updateTimer();

		// Then update every second
		intervalRef.current = setInterval(updateTimer, 1000);

		return () => {
			if (intervalRef.current) {
				clearInterval(intervalRef.current);
				intervalRef.current = null;
			}
		};
	}, [isActive, endsAt, onExpire, autoStop]);

	// Format time for display
	const formatTime = useCallback((seconds: number): string => {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins}:${secs.toString().padStart(2, "0")}`;
	}, []);

	return {
		isActive,
		timeRemaining,
		endsAt,
		formattedTime: formatTime(timeRemaining),
		start,
		startUntil,
		stop,
		isExpired: timeRemaining === 0 && expiredRef.current,
	};
}
