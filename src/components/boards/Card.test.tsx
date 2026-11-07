import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Card as CardType } from "~/types/database";
import { Card } from "./Card";
import { SPRINT_ITEM_MIME } from "./SprintItems";

jest.mock("@flags-gg/react-library", () => ({
	useFlags: () => ({ is: () => ({ enabled: () => true }) }),
}));
const card = {
	id: "card",
	column_id: "column",
	author_id: "me",
	content: "Deploys were slow",
	position: 0,
	is_masked: false,
	items: [{ ticket_id: "old", ticket_key: "TL-1", title: "Old", url: "#" }],
} as unknown as CardType;

function show(userId: string) {
	render(
		<QueryClientProvider client={new QueryClient()}>
			<DndContext>
				<SortableContext items={["card"]}>
					<Card
						card={card}
						currentUserId={userId}
						boardId="board"
						boardPhase="creation"
					/>
				</SortableContext>
			</DndContext>
		</QueryClientProvider>,
	);
	return screen
		.getByText("Deploys were slow")
		.closest("[data-slot=card]") as HTMLElement;
}
function drop(target: HTMLElement, id: string) {
	const dataTransfer = {
		types: [SPRINT_ITEM_MIME],
		getData: (type: string) => (type === SPRINT_ITEM_MIME ? id : ""),
		dropEffect: "",
	};
	fireEvent.dragOver(target, { dataTransfer });
	fireEvent.drop(target, { dataTransfer });
}
beforeEach(() => {
	jest.clearAllMocks();
	(fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) });
});

test("a sprint ticket dropped on your own card is added to its links", async () => {
	drop(show("me"), "new");
	await waitFor(() => expect(fetch).toHaveBeenCalled());
	const [url, options] = (fetch as jest.Mock).mock.calls[0];
	expect(url).toBe("/api/boards/board/cards");
	expect(JSON.parse(options.body)).toEqual({
		cardId: "card",
		item_ids: ["old", "new"],
	});
});

test("someone else's card does not take dropped tickets", () => {
	drop(show("someone-else"), "new");
	expect(fetch).not.toHaveBeenCalled();
});
