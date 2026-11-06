import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TracklinesSetup } from "./TracklinesSetup";

let mockEnabled = true;
jest.mock("@flags-gg/react-library", () => ({
	useFlags: () => ({ is: () => ({ enabled: () => mockEnabled }) }),
}));
function wrap(children: React.ReactNode) {
	return render(
		<QueryClientProvider
			client={
				new QueryClient({ defaultOptions: { queries: { retry: false } } })
			}
		>
			{children}
		</QueryClientProvider>,
	);
}
beforeEach(() => {
	jest.clearAllMocks();
	mockEnabled = true;
});
test("keeps the existing normal flow with no source choice when disconnected or disabled", async () => {
	mockEnabled = false;
	const off = wrap(<TracklinesSetup onChange={jest.fn()} />);
	expect(fetch).not.toHaveBeenCalled();
	off.unmount();
	mockEnabled = true;
	(fetch as jest.Mock).mockResolvedValue({
		ok: true,
		json: async () => ({ connected: false }),
	});
	wrap(<TracklinesSetup onChange={jest.fn()} />);
	await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
	expect(screen.queryByText("Session source")).not.toBeInTheDocument();
});
test("loads accessible projects and boards, disables unestimated boards, and previews the backlog", async () => {
	const change = jest.fn();
	(fetch as jest.Mock).mockImplementation(async (url: string) => ({
		ok: true,
		json: async () =>
			url.includes("board_id=")
				? { tickets: [{ id: "ticket" }], scale: { values: ["1", "2", "4"] } }
				: url.includes("project_id=")
					? {
							boards: [
								{ id: "board", name: "Team", estimate_scale: "powers" },
								{ id: "none", name: "No scale", estimate_scale: "none" },
							],
						}
					: { connected: true, projects: [{ id: "project", name: "Project" }] },
	}));
	wrap(<TracklinesSetup onChange={change} />);
	fireEvent.change(await screen.findByLabelText("Normal or TrackLin.es"), {
		target: { value: "tracklines" },
	});
	expect(change).toHaveBeenLastCalledWith({ project_id: "", board_id: "" });
	fireEvent.change(screen.getByLabelText("TrackLin.es project"), {
		target: { value: "project" },
	});
	expect(change).toHaveBeenLastCalledWith({
		project_id: "project",
		board_id: "",
	});
	expect(
		await screen.findByRole("option", { name: "No scale (none)" }),
	).toBeDisabled();
	fireEvent.change(screen.getByLabelText("TrackLin.es board"), {
		target: { value: "board" },
	});
	expect(change).toHaveBeenLastCalledWith({
		project_id: "project",
		board_id: "board",
	});
	expect(await screen.findByText(/1 backlog tickets/)).toBeInTheDocument();
});
