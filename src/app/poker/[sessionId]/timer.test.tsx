import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { usePokerChannel } from "~/hooks/usePokerChannel";
import { usePokerTimer } from "~/hooks/usePokerTimer";
import PokerSessionPage from "./page";

// Mock dependencies
jest.mock("@clerk/nextjs", () => ({
	useUser: jest.fn(() => ({
		user: { id: "facilitator-1", fullName: "Facilitator" },
	})),
	auth: jest.fn(() => Promise.resolve({ userId: "facilitator-1" })),
}));

jest.mock("next/navigation", () => ({
	useParams: jest.fn(() => ({ sessionId: "test-session" })),
	useRouter: jest.fn(() => ({
		push: jest.fn(),
		refresh: jest.fn(),
	})),
}));

jest.mock("~/hooks/usePokerChannel");
jest.mock("~/hooks/usePokerTimer");

// Mock fetch
global.fetch = jest.fn();

describe("Poker Timer Functionality", () => {
	let queryClient: QueryClient;
	// biome-ignore lint/suspicious/noExplicitAny: Mock object for testing
	let mockChannelState: any;
	// biome-ignore lint/suspicious/noExplicitAny: Mock object for testing
	let mockTimerState: any;
	let mockStartTimer: jest.Mock;
	let mockStopTimer: jest.Mock;
	let mockSelectStory: jest.Mock;
	let mockStartVoting: jest.Mock;

	const wrapper = ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	);

	beforeEach(() => {
		queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});

		// Reset mocks
		jest.clearAllMocks();

		// Mock timer state
		mockTimerState = {
			isActive: false,
			startUntil: jest.fn(),
			stop: jest.fn(),
		};

		// Mock channel functions
		mockStartTimer = jest.fn();
		mockStopTimer = jest.fn();
		mockSelectStory = jest.fn();
		mockStartVoting = jest.fn();

		// Mock channel state
		mockChannelState = {
			isConnected: true,
			sessionState: {
				sessionId: "test-session",
				participants: [
					{
						id: "facilitator-1",
						name: "Facilitator",
						role: "facilitator",
						hasVoted: false,
						isAbstaining: false,
					},
					{
						id: "voter-1",
						name: "Voter 1",
						role: "voter",
						hasVoted: false,
						isAbstaining: false,
					},
				],
				stories: [
					{
						id: "story-1",
						title: "Test Story",
						description: "Test Description",
						isEstimated: false,
					},
				],
				votingState: {
					isVoting: false,
					votesReceived: 0,
					eligibleVoters: 1,
				},
				timer: {
					isActive: false,
				},
			},
			startTimer: mockStartTimer,
			stopTimer: mockStopTimer,
			selectStory: mockSelectStory,
			startVoting: mockStartVoting,
			join: jest.fn(),
			leave: jest.fn(),
			vote: jest.fn(),
			abstain: jest.fn(),
			unabstain: jest.fn(),
			createStory: jest.fn(),
			endVoting: jest.fn(),
			announceScore: jest.fn(),
		};

		(usePokerChannel as jest.Mock).mockReturnValue(mockChannelState);
		(usePokerTimer as jest.Mock).mockReturnValue(mockTimerState);

		// Mock API responses
		(fetch as jest.Mock).mockImplementation((url) => {
			if (url.includes("/api/poker-sessions/test-session")) {
				if (url.includes("/stories")) {
					return Promise.resolve({
						ok: true,
						json: () =>
							Promise.resolve([
								{
									id: "story-1",
									title: "Test Story",
									description: "Test Description",
									votes: [],
								},
							]),
					});
				}
				return Promise.resolve({
					ok: true,
					json: () =>
						Promise.resolve({
							id: "test-session",
							name: "Test Session",
							created_by: "facilitator-1",
							reveal_votes: false,
							participants: [],
						}),
				});
			}
			return Promise.resolve({
				ok: true,
				json: () => Promise.resolve({}),
			});
		});
	});

	describe("Timer Start", () => {
		it("should start timer when facilitator selects a story", async () => {
			render(<PokerSessionPage />, { wrapper });

			// Wait for initial load
			await waitFor(() => {
				expect(screen.getByText("Test Session")).toBeInTheDocument();
			});

			// Simulate selecting a story
			const selectButton = screen.getByRole("button", { name: /select/i });
			await userEvent.click(selectButton);

			// Verify timer methods were called
			await waitFor(() => {
				expect(mockSelectStory).toHaveBeenCalledWith("story-1", "Test Story");
				expect(mockStartVoting).toHaveBeenCalledWith("story-1");
				expect(mockStartTimer).toHaveBeenCalledWith(60); // Default 60 seconds
			});
		});

		it("should display timer when timer_start message is received", async () => {
			// Start with timer inactive
			render(<PokerSessionPage />, { wrapper });

			await waitFor(() => {
				expect(screen.getByText("Test Session")).toBeInTheDocument();
			});

			// Simulate timer start message
			const endsAt = new Date(Date.now() + 60000).toISOString();
			act(() => {
				mockChannelState.sessionState.timer = {
					isActive: true,
					duration: 60,
					endsAt,
				};
			});

			// Update the mock to return the new state
			(usePokerChannel as jest.Mock).mockReturnValue({
				...mockChannelState,
				sessionState: {
					...mockChannelState.sessionState,
					timer: {
						isActive: true,
						duration: 60,
						endsAt,
					},
				},
			});

			// Re-render with new state
			const { rerender } = render(<PokerSessionPage />, { wrapper });
			rerender(<PokerSessionPage />);

			// Check timer is displayed
			await waitFor(() => {
				// Timer icon should be visible
				const timerElements = screen.getAllByTestId("timer-display");
				expect(timerElements.length).toBeGreaterThan(0);
			});
		});
	});

	describe("Timer Stop", () => {
		it("should stop timer when voting is finalized", async () => {
			// Start with timer active
			const endsAt = new Date(Date.now() + 60000).toISOString();
			mockChannelState.sessionState.timer = {
				isActive: true,
				duration: 60,
				endsAt,
			};
			mockChannelState.sessionState.currentStory = {
				id: "story-1",
				title: "Test Story",
			};

			(usePokerChannel as jest.Mock).mockReturnValue(mockChannelState);

			render(<PokerSessionPage />, { wrapper });

			await waitFor(() => {
				expect(screen.getByText("Test Session")).toBeInTheDocument();
			});

			// Click reveal votes (which should stop timer)
			const revealButton = screen.getByRole("button", {
				name: /reveal votes/i,
			});
			await userEvent.click(revealButton);

			// Verify stopTimer was called
			await waitFor(() => {
				expect(mockStopTimer).toHaveBeenCalled();
			});
		});

		it("should hide timer display when timer_stop message is received", async () => {
			// Start with timer active
			const endsAt = new Date(Date.now() + 60000).toISOString();
			mockChannelState.sessionState.timer = {
				isActive: true,
				duration: 60,
				endsAt,
			};

			const { rerender } = render(<PokerSessionPage />, { wrapper });

			// Simulate timer stop message
			act(() => {
				mockChannelState.sessionState.timer = {
					isActive: false,
				};
			});

			(usePokerChannel as jest.Mock).mockReturnValue({
				...mockChannelState,
				sessionState: {
					...mockChannelState.sessionState,
					timer: {
						isActive: false,
					},
				},
			});

			rerender(<PokerSessionPage />);

			// Timer should not be displayed
			await waitFor(() => {
				const timerElements = screen.queryAllByTestId("timer-display");
				expect(timerElements).toHaveLength(0);
			});
		});
	});

	describe("Timer Synchronization", () => {
		it("should sync timer state between facilitator and participants", async () => {
			// Test as participant
			(usePokerChannel as jest.Mock).mockReturnValue({
				...mockChannelState,
				sessionState: {
					...mockChannelState.sessionState,
					participants: [
						{
							id: "voter-1",
							name: "Voter 1",
							role: "voter",
							hasVoted: false,
							isAbstaining: false,
						},
						{
							id: "facilitator-1",
							name: "Facilitator",
							role: "facilitator",
							hasVoted: false,
							isAbstaining: false,
						},
					],
				},
			});

			render(<PokerSessionPage />, { wrapper });

			// Simulate timer start from facilitator
			const endsAt = new Date(Date.now() + 60000).toISOString();
			act(() => {
				// Message for simulating timer start
				const _message = {
					type: "timer_start",
					sessionId: "test-session",
					userId: "facilitator-1",
					duration: 60,
					endsAt,
					timestamp: new Date().toISOString(),
				};

				// Simulate the message being processed
				mockChannelState.sessionState.timer = {
					isActive: true,
					duration: 60,
					endsAt,
				};
			});

			(usePokerChannel as jest.Mock).mockReturnValue({
				...mockChannelState,
				sessionState: {
					...mockChannelState.sessionState,
					timer: {
						isActive: true,
						duration: 60,
						endsAt,
					},
				},
			});

			const { rerender } = render(<PokerSessionPage />, { wrapper });
			rerender(<PokerSessionPage />);

			// Participant should see the timer
			await waitFor(() => {
				const timerElements = screen.queryAllByTestId("timer-display");
				expect(timerElements.length).toBeGreaterThan(0);
			});
		});

		it("should update timer countdown correctly", async () => {
			const futureTime = new Date(Date.now() + 30000); // 30 seconds from now
			mockChannelState.sessionState.timer = {
				isActive: true,
				duration: 60,
				endsAt: futureTime.toISOString(),
			};

			(usePokerChannel as jest.Mock).mockReturnValue(mockChannelState);
			(usePokerTimer as jest.Mock).mockReturnValue({
				...mockTimerState,
				isActive: true,
			});

			render(<PokerSessionPage />, { wrapper });

			// Check that timer shows approximately 30 seconds
			await waitFor(() => {
				// Look for time display (should show 0:30 or similar)
				const timeDisplay = screen.getByText(/0:[2-3]\d/);
				expect(timeDisplay).toBeInTheDocument();
			});
		});
	});

	describe("Timer Edge Cases", () => {
		it("should handle timer expiry correctly", async () => {
			// biome-ignore lint/correctness/noUnusedVariables: Used in mock implementation
			const onExpire = jest.fn();
			(usePokerTimer as jest.Mock).mockImplementation(({ onExpire: cb }) => {
				// Simulate timer expiry
				setTimeout(() => cb?.(), 100);
				return mockTimerState;
			});

			render(<PokerSessionPage />, { wrapper });

			await waitFor(
				() => {
					expect(mockStopTimer).toHaveBeenCalled();
				},
				{ timeout: 200 },
			);
		});

		it("should not start multiple timers simultaneously", async () => {
			render(<PokerSessionPage />, { wrapper });

			// Select story multiple times quickly
			const selectButton = screen.getByRole("button", { name: /select/i });
			await userEvent.click(selectButton);
			await userEvent.click(selectButton);
			await userEvent.click(selectButton);

			// Should only start timer once
			expect(mockStartTimer).toHaveBeenCalledTimes(1);
		});
	});
});