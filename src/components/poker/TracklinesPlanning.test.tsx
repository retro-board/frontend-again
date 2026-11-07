import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TracklinesPlanning } from "./TracklinesPlanning";

jest.mock("@flags-gg/react-library", () => ({
	useFlags: () => ({ is: () => ({ enabled: () => true }) }),
}));
const stories = [
	{
		id: "a",
		title: "First",
		tracklines_key: "TL-1",
		final_estimate: "4",
		is_estimated: true,
	},
	{
		id: "b",
		title: "Second",
		tracklines_key: "TL-2",
		final_estimate: "8",
		is_estimated: true,
	},
];
function wrap(facilitator = true) {
	return render(
		<QueryClientProvider
			client={
				new QueryClient({ defaultOptions: { queries: { retry: false } } })
			}
		>
			<TracklinesPlanning
				sessionId="session"
				facilitator={facilitator}
				linked
			/>
		</QueryClientProvider>,
	);
}
// The planning list lives in a side drawer: open it from its button
async function openDrawer() {
	fireEvent.click(
		await screen.findByRole("button", { name: /Plan in TrackLin\.es/ }),
	);
}
beforeEach(() => jest.clearAllMocks());
test("does not request planning controls for a non-facilitator", () => {
	wrap(false);
	expect(fetch).not.toHaveBeenCalled();
	expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
test("links to TrackLin.es when no planned sprints exist", async () => {
	(fetch as jest.Mock).mockResolvedValue({
		ok: true,
		json: async () => ({
			sprints: [],
			stories,
			boardUrl: "https://tracklin.es/boards/team",
		}),
	});
	wrap();
	await openDrawer();
	expect(await screen.findByText(/No planned sprints yet/)).toBeInTheDocument();
	expect(screen.getByRole("link")).toHaveAttribute(
		"href",
		"https://tracklin.es/boards/team",
	);
	expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
});
test("shows partial outcomes and retries only the failed ticket", async () => {
	let posts = 0;
	(fetch as jest.Mock).mockImplementation(
		async (_url: string, options?: RequestInit) => ({
			ok: true,
			json: async () =>
				options?.method === "POST"
					? ++posts === 1
						? {
								results: [
									{
										story_id: "a",
										status: "failed",
										error: "Capacity approval needed",
									},
									{ story_id: "b", status: "planned" },
								],
							}
						: { results: [{ story_id: "a", status: "planned" }] }
					: {
							sprints: [{ id: "future", number: 23 }],
							stories,
							boardUrl: "https://tracklin.es/boards/team",
						},
		}),
	);
	wrap();
	await openDrawer();
	const selects = await screen.findAllByRole("combobox");
	for (const select of selects)
		fireEvent.change(select, { target: { value: "future" } });
	fireEvent.click(
		screen.getByRole("button", { name: "Plan selected tickets" }),
	);
	expect(
		await screen.findByText("Capacity approval needed"),
	).toBeInTheDocument();
	expect(screen.getByText("Planned successfully")).toBeInTheDocument();
	fireEvent.click(screen.getByRole("button", { name: "Retry planning" }));
	await waitFor(() =>
		expect(screen.getAllByText("Planned successfully")).toHaveLength(2),
	);
	const sent = (fetch as jest.Mock).mock.calls.filter(
		([, options]) => options?.method === "POST",
	);
	expect(JSON.parse(sent[1][1].body)).toEqual({
		plans: [{ story_id: "a", planned_sprint_id: "future" }],
	});
});
test("picking a ticket in the drawer selects it and closes the drawer", async () => {
	(fetch as jest.Mock).mockResolvedValue({
		ok: true,
		json: async () => ({ sprints: [], stories, boardUrl: "https://x" }),
	});
	const onSelect = jest.fn();
	render(
		<QueryClientProvider client={new QueryClient()}>
			<TracklinesPlanning
				sessionId="s"
				facilitator
				linked
				onSelect={onSelect}
			/>
		</QueryClientProvider>,
	);
	await openDrawer();
	fireEvent.click(await screen.findByRole("button", { name: /TL-2/ }));
	expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "b" }));
	await waitFor(() =>
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
	);
});
