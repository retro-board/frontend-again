import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
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
	expect(await screen.findByRole("link", { name: "TL-22" })).toHaveAttribute(
		"href",
		item.url,
	);
	expect(screen.getByText("(5)")).toBeInTheDocument();
	expect(screen.getByRole("status")).toHaveTextContent("Showing saved tickets");
	fireEvent.click(screen.getByRole("button", { name: "Refresh tickets" }));
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
