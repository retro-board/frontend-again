import { fireEvent, render, screen } from "@testing-library/react";
import { usePaged } from "./Pager";

function List({ items }: { items: number[] }) {
	const list = usePaged(items, 2);
	return (
		<>
			<ul>
				{list.items.map((n) => (
					<li key={n}>{n}</li>
				))}
			</ul>
			{list.pager}
		</>
	);
}

test("pages through a list and hides with one page", () => {
	const { rerender } = render(<List items={[1, 2, 3, 4, 5]} />);
	expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
		"1",
		"2",
	]);
	expect(screen.getByRole("button", { name: /Previous/ })).toBeDisabled();
	fireEvent.click(screen.getByRole("button", { name: /Next/ }));
	fireEvent.click(screen.getByRole("button", { name: /Next/ }));
	expect(screen.getByText("Page 3 of 3")).toBeInTheDocument();
	expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
		"5",
	]);
	// the list shrinks to one page: show it, and no pager
	rerender(<List items={[1, 2]} />);
	expect(screen.getAllByRole("listitem")).toHaveLength(2);
	expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
});
