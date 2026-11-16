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
	const deadlineRef = useRef<number | null>(null);
	// Callers pass onExpire inline; keeping it in a ref stops each re-render rebuilding the interval (RB-32).
	const onExpireRef = useRef(onExpire);
	useEffect(() => {
		onExpireRef.current = onExpire;
	}, [onExpire]);

	// Start timer with duration in seconds
	const start = useCallback((duration: number) => {
		deadlineRef.current = null;
		expiredRef.current = false;
		setIsActive(true);
		setTimeRemaining(duration);
		setEndsAt(new Date(Date.now() + duration * 1000));
	}, []);

	// Start timer with specific end time
	const startUntil = useCallback((endTime: Date | string) => {
		const end = typeof endTime === "string" ? new Date(endTime) : endTime;
		// The same deadline again is the session state re-syncing, not a new timer. Restarting one
		// that already expired would expire it again, and whoever syncs on isActive would restart
		// it again: an endless render loop (React error #185).
		if (deadlineRef.current === end.getTime()) return;
		deadlineRef.current = end.getTime();
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
		// deadlineRef is kept: the session state can still hold this deadline until the stop
		// reaches the server, and re-syncing it must not restart the timer (RB-30).
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

				onExpireRef.current?.();

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
	}, [isActive, endsAt, autoStop]);

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
