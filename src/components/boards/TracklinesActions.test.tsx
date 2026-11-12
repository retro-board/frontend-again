import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TracklinesActions } from "./TracklinesActions";

let mockEnabled = true;
jest.mock("@flags-gg/react-library", () => ({
	useFlags: () => ({ is: () => ({ enabled: () => mockEnabled }) }),
}));
const pending = {
	id: "card",
	content: "Fix flaky tests",
	error: "TrackLin.es offline",
	ticketKey: null,
	url: null,
	waitingForReveal: false,
};
const synced = {
	...pending,
	error: null,
	ticketKey: "TL-5",
	url: "https://tracklin.es/tickets/ticket",
};
function mount(isOwner = true) {
	return render(
		<QueryClientProvider
			client={
				new QueryClient({ defaultOptions: { queries: { retry: false } } })
			}
		>
			<TracklinesActions boardId="retro" isOwner={isOwner} />
		</QueryClientProvider>,
	);
}
beforeEach(() => {
	jest.clearAllMocks();
	mockEnabled = true;
});
it("stays hidden with the flag off", () => {
	mockEnabled = false;
	mount();
	expect(fetch).not.toHaveBeenCalled();
	expect(
		screen.queryByText("Action items in TrackLin.es"),
	).not.toBeInTheDocument();
});
it("stays hidden on ordinary retros", async () => {
	(fetch as jest.Mock).mockResolvedValue({
		ok: true,
		json: async () => ({ linked: false, actions: [] }),
	});
	mount();
	await waitFor(() => expect(fetch).toHaveBeenCalled());
	expect(
		screen.queryByText("Action items in TrackLin.es"),
	).not.toBeInTheDocument();
});
it("shows failed sends and lets the owner retry into a ticket link", async () => {
	(fetch as jest.Mock)
		.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ linked: true, completed: true, actions: [pending] }),
		})
		.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ linked: true, completed: true, actions: [synced] }),
		});
	mount();
	expect(await screen.findByText("TrackLin.es offline")).toBeInTheDocument();
	fireEvent.click(
		screen.getByRole("button", { name: "Send pending action items" }),
	);
	expect(await screen.findByRole("link", { name: "TL-5" })).toHaveAttribute(
		"href",
		synced.url,
	);
	expect(fetch).toHaveBeenLastCalledWith("/api/boards/retro/actions", {
		method: "POST",
	});
});
it("does not offer send controls to participants", async () => {
	(fetch as jest.Mock).mockResolvedValue({
		ok: true,
		json: async () => ({ linked: true, completed: true, actions: [pending] }),
	});
	mount(false);
	await screen.findByText("Fix flaky tests");
	expect(
		screen.queryByRole("button", { name: "Send pending action items" }),
	).not.toBeInTheDocument();
});

it("does not offer sending before completion", async () => {
	(fetch as jest.Mock).mockResolvedValue({
		ok: true,
		json: async () => ({ linked: true, completed: false, actions: [pending] }),
	});
	mount();
	await screen.findByText("Fix flaky tests");
	expect(
		screen.queryByRole("button", { name: "Send pending action items" }),
	).not.toBeInTheDocument();
});
