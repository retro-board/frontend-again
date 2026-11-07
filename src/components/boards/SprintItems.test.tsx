import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SprintItemPicker, SprintItems } from "./SprintItems";

let mockEnabled = true;
jest.mock("@flags-gg/react-library", () => ({
	useFlags: () => ({ is: () => ({ enabled: () => mockEnabled }) }),
}));
const item = {
	id: "ticket",
	key: "TL-22",
	title: "Ship release",
	estimate: "5",
	url: "https://tracklin.es/tickets/ticket",
};
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
	(fetch as jest.Mock).mockResolvedValue({
		ok: true,
		json: async () => ({
			items: [item],
			linked: true,
			stale: true,
			note: "Showing saved tickets",
		}),
	});
});
test("does not request or show sprint items while the feature flag is off", () => {
	mockEnabled = false;
	wrap(<SprintItems boardId="board" />);
	expect(screen.queryByText("Sprint items")).not.toBeInTheDocument();
	expect(fetch).not.toHaveBeenCalled();
});
test("shows ticket links, estimates, refresh, and a cached-data note", async () => {
	wrap(<SprintItems boardId="board" />);
	expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	fireEvent.click(
		await screen.findByRole("button", { name: /Sprint tickets/ }),
	);
	expect(
		await screen.findByRole("dialog", { name: "Sprint tickets" }),
	).toHaveClass("right-0");
	expect(screen.getAllByRole("button", { name: "Close" })).toHaveLength(2); // X + footer
	expect(await screen.findByRole("link", { name: "TL-22" })).toHaveAttribute(
		"href",
		item.url,
	);
	expect(screen.getByText("(5)")).toBeInTheDocument();
	expect(screen.getByRole("status")).toHaveTextContent("Showing saved tickets");
	fireEvent.click(screen.getByRole("button", { name: "Refresh tickets" }));
	fireEvent.click(screen.getByText("Close", { selector: "button" })); // the footer button
	await waitFor(() =>
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
	);
	expect(screen.getByRole("button", { name: /Sprint tickets/ })).toHaveFocus();
});
test("lets authors select a sprint ticket or clear existing links", async () => {
	const change = jest.fn();
	wrap(
		<SprintItemPicker
			boardId="board"
			selected={["ticket"]}
			onChange={change}
		/>,
	);
	const checkbox = await screen.findByRole("checkbox");
	expect(checkbox).toBeChecked();
	fireEvent.click(checkbox);
	expect(change).toHaveBeenCalledWith([]);
	fireEvent.click(screen.getByRole("button", { name: "Clear ticket links" }));
	expect(change).toHaveBeenLastCalledWith([]);
});
