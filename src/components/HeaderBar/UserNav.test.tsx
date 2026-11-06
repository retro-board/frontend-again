import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { UserNav } from "./UserNav";

jest.mock("@clerk/nextjs", () => ({
	Show: ({ when, children }: { when: string; children: ReactNode }) =>
		when === "signed-in" ? children : null,
	SignInButton: ({ children }: { children: ReactNode }) => children,
	UserButton: () => null,
}));

let mockSettingsOn = false;
jest.mock("@flags-gg/react-library", () => ({
	useFlags: () => ({
		is: (name: string) => ({
			enabled: () => name === "settings" && mockSettingsOn,
		}),
	}),
}));

describe("UserNav settings link (RB-8)", () => {
	it("is hidden while the settings flag is off", () => {
		mockSettingsOn = false;
		render(<UserNav />);
		expect(screen.queryByText("Settings")).toBeNull();
	});

	it("shows when the settings flag is on", () => {
		mockSettingsOn = true;
		render(<UserNav />);
		expect(screen.getByText("Settings").closest("a")).toHaveAttribute(
			"href",
			"/settings",
		);
	});
});
