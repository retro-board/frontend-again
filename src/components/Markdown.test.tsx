import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { Markdown } from "./Markdown";

// react-markdown is ESM-only (Jest can't load it): stand in for it and render the link override
jest.mock("react-markdown", () => ({
	__esModule: true,
	default: ({
		components,
	}: {
		components: { a: (p: object) => ReactElement };
	}) => components.a({ href: "https://tracklin.es", children: "link" }),
}));

test("opens links in a new tab and puts list styling back", () => {
	const { container } = render(<Markdown className="text-sm">- one</Markdown>);
	const link = screen.getByRole("link");
	expect(link).toHaveAttribute("target", "_blank");
	expect(link).toHaveAttribute("rel", "noreferrer");
	expect(container.firstChild).toHaveClass("[&_ul]:list-disc", "text-sm");
});
