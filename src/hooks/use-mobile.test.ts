import { act, renderHook } from "@testing-library/react";
import { useIsMobile } from "./use-mobile";

describe("useIsMobile", () => {
	const originalMatchMedia = window.matchMedia;
	const originalInnerWidth = window.innerWidth;

	beforeEach(() => {
		// Reset matchMedia mock before each test
		Object.defineProperty(window, "matchMedia", {
			writable: true,
			value: jest.fn(),
		});
		// Mock innerWidth
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1024,
		});
	});

	afterAll(() => {
		window.matchMedia = originalMatchMedia;
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: originalInnerWidth,
		});
	});

	it("should return true when screen width is less than 768px", () => {
		// Set window width to mobile size
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 500,
		});

		window.matchMedia = jest.fn().mockImplementation((query) => ({
			matches: query === "(max-width: 767px)",
			media: query,
			onchange: null,
			addListener: jest.fn(),
			removeListener: jest.fn(),
			addEventListener: jest.fn(),
			removeEventListener: jest.fn(),
			dispatchEvent: jest.fn(),
		}));

		const { result } = renderHook(() => useIsMobile());
		expect(result.current).toBe(true);
	});

	it("should return false when screen width is greater than 768px", () => {
		// Set window width to desktop size
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1024,
		});

		window.matchMedia = jest.fn().mockImplementation((query) => ({
			matches: false,
			media: query,
			onchange: null,
			addListener: jest.fn(),
			removeListener: jest.fn(),
			addEventListener: jest.fn(),
			removeEventListener: jest.fn(),
			dispatchEvent: jest.fn(),
		}));

		const { result } = renderHook(() => useIsMobile());
		expect(result.current).toBe(false);
	});

	it("should update when media query changes", () => {
		let changeListener: ((event: unknown) => void) | null = null;

		// Start with desktop width
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1024,
		});

		const mockMatchMedia = {
			matches: false,
			media: "(max-width: 767px)",
			onchange: null,
			addListener: jest.fn(),
			removeListener: jest.fn(),
			addEventListener: jest.fn(
				(event: string, listener: (event: unknown) => void) => {
					if (event === "change") {
						changeListener = listener;
					}
				},
			),
			removeEventListener: jest.fn(),
			dispatchEvent: jest.fn(),
		};

		window.matchMedia = jest.fn().mockImplementation(() => mockMatchMedia);

		const { result } = renderHook(() => useIsMobile());
		expect(result.current).toBe(false);

		// Simulate media query change to mobile
		act(() => {
			// Update window width
			Object.defineProperty(window, "innerWidth", {
				writable: true,
				configurable: true,
				value: 500,
			});
			// Trigger the change listener
			if (changeListener) {
				const event = { matches: true } as unknown;
				(changeListener as (event: unknown) => void)(event);
			}
		});

		expect(result.current).toBe(true);
	});

	it("should cleanup event listener on unmount", () => {
		const removeEventListenerSpy = jest.fn();
		const addEventListenerSpy = jest.fn();

		window.matchMedia = jest.fn().mockImplementation(() => ({
			matches: false,
			media: "(max-width: 767px)",
			onchange: null,
			addListener: jest.fn(),
			removeListener: jest.fn(),
			addEventListener: addEventListenerSpy,
			removeEventListener: removeEventListenerSpy,
			dispatchEvent: jest.fn(),
		}));

		const { unmount } = renderHook(() => useIsMobile());

		expect(addEventListenerSpy).toHaveBeenCalledWith(
			"change",
			expect.any(Function),
		);

		unmount();

		expect(removeEventListenerSpy).toHaveBeenCalledWith(
			"change",
			expect.any(Function),
		);
	});

	it("should handle undefined matchMedia gracefully", () => {
		// Simulate environment without matchMedia
		delete (window as { matchMedia?: unknown }).matchMedia;

		// Mock console.error to avoid error output in tests
		const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

		// This will throw an error since matchMedia is undefined
		expect(() => renderHook(() => useIsMobile())).toThrow();

		consoleErrorSpy.mockRestore();
	});
});
