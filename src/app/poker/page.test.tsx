import { useUser } from "@clerk/nextjs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { tracklinesRequest } from "~/components/poker/TracklinesSetup";
import PokerPage from "./page";

jest.mock("~/hooks/useUserSync", () => ({
	useUserSync: () => ({ syncedUser: { id: "db-user" } }),
}));
jest.mock("~/components/poker/TracklinesSetup", () => ({
	TracklinesSetup: ({
		onChange,
	}: {
		onChange: (source: { project_id: string; board_id: string } | null) => void;
	}) => (
		<div>
			<button
				type="button"
				onClick={() => onChange({ project_id: "project", board_id: "board" })}
			>
				Choose linked board
			</button>
			<button type="button" onClick={() => onChange(null)}>
				Choose normal
			</button>
		</div>
	),
	tracklinesRequest: jest.fn(),
}));
beforeEach(() => {
	jest.clearAllMocks();
	(useUser as jest.Mock).mockReturnValue({
		isLoaded: true,
		user: { id: "clerk-user" },
	});
	(fetch as jest.Mock).mockResolvedValue({
		ok: true,
		json: async () => ({ sessions: [] }),
	});
	(tracklinesRequest as jest.Mock).mockResolvedValue({
		session: { id: "session", name: "Frontend - 1" },
	});
});
test("creates a linked poker session without asking for a name, while normal sessions still require one", async () => {
	render(
		<QueryClientProvider
			client={
				new QueryClient({ defaultOptions: { queries: { retry: false } } })
			}
		>
			<PokerPage />
		</QueryClientProvider>,
	);
	fireEvent.click(await screen.findByRole("button", { name: "New Session" }));
	expect(
		screen.getByRole("textbox", { name: "Session Name" }),
	).toBeInTheDocument();
	expect(screen.getByRole("button", { name: "Create Session" })).toBeDisabled();
	fireEvent.click(screen.getByRole("button", { name: "Choose linked board" }));
	expect(
		screen.queryByRole("textbox", { name: "Session Name" }),
	).not.toBeInTheDocument();
	expect(screen.getByRole("button", { name: "Create Session" })).toBeEnabled();
	fireEvent.click(screen.getByRole("button", { name: "Choose normal" }));
	expect(
		screen.getByRole("textbox", { name: "Session Name" }),
	).toBeInTheDocument();
	expect(screen.getByRole("button", { name: "Create Session" })).toBeDisabled();
	fireEvent.click(screen.getByRole("button", { name: "Choose linked board" }));
	fireEvent.click(screen.getByRole("button", { name: "Create Session" }));
	await waitFor(() =>
		expect(tracklinesRequest).toHaveBeenCalledWith("/api/tracklines/poker", {
			project_id: "project",
			board_id: "board",
			description: "",
			result_method: "average",
		}),
	);
});
