import { fireEvent, render, screen } from "@testing-library/react";
import { LabelFilter } from "./LabelFilter";

const labels: [string, number][] = [
	["frontend", 3],
	["backend", 2],
];
// Radix opens on keyboard in jsdom (no real pointer events)
function open() {
	const trigger = screen.getByRole("button");
	trigger.focus();
	fireEvent.keyDown(trigger, { key: "Enter" });
}

test("ticks extra labels and clears back to all", () => {
	const onChange = jest.fn();
	const { rerender } = render(
		<LabelFilter labels={labels} selected={["frontend"]} onChange={onChange} />,
	);
	expect(screen.getByRole("button")).toHaveTextContent("frontend");
	open();
	fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /backend/ }));
	expect(onChange).toHaveBeenLastCalledWith(["frontend", "backend"]);
	fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /frontend/ }));
	expect(onChange).toHaveBeenLastCalledWith([]);
	fireEvent.click(screen.getByRole("menuitem", { name: "Show all labels" }));
	expect(onChange).toHaveBeenLastCalledWith([]);
	rerender(<LabelFilter labels={labels} selected={[]} onChange={onChange} />);
	expect(
		screen.getByRole("button", { name: /All labels/ }),
	).toBeInTheDocument();
});
