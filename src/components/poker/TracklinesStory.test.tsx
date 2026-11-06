import { render, screen } from "@testing-library/react";
import type { Story } from "~/types/database";
import { TracklinesStory } from "./TracklinesStory";

let mockEnabled = true;
jest.mock("@flags-gg/react-library", () => ({
	useFlags: () => ({ is: () => ({ enabled: () => mockEnabled }) }),
}));
jest.mock("react-markdown", () => ({
	__esModule: true,
	default: ({ children }: { children: string }) => <div>{children}</div>,
}));
const story = {
	id: "story",
	title: "A ticket",
	description: "**Markdown description**",
	tracklines_key: "TL-22",
	tracklines_url: "https://tracklin.es/tickets/ticket",
	tracklines_attachments: [
		{
			id: "image",
			name: "design.png",
			content_type: "image/png",
			url: "https://files.test/design.png",
		},
		{
			id: "pdf",
			name: "notes.pdf",
			content_type: "application/pdf",
			url: "https://files.test/notes.pdf",
		},
		{
			id: "unsafe",
			name: "Unsafe",
			content_type: "image/png",
			url: "javascript:alert(1)",
		},
	],
} as Story;
beforeEach(() => {
	mockEnabled = true;
});
test("shows the ticket link, description, inline images and downloadable files without unsafe URLs", () => {
	render(<TracklinesStory story={story} />);
	expect(screen.getByRole("link", { name: "TL-22" })).toHaveAttribute(
		"href",
		story.tracklines_url,
	);
	expect(screen.getByText("**Markdown description**")).toBeInTheDocument();
	expect(screen.getByAltText("design.png")).toHaveAttribute(
		"src",
		"https://files.test/design.png",
	);
	expect(screen.getByRole("link", { name: "notes.pdf" })).toHaveAttribute(
		"href",
		"https://files.test/notes.pdf",
	);
	expect(screen.queryByAltText("Unsafe")).not.toBeInTheDocument();
});
test("hides the extra story details with the feature flag off", () => {
	mockEnabled = false;
	render(<TracklinesStory story={story} />);
	expect(screen.queryByRole("link")).not.toBeInTheDocument();
});
