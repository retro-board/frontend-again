jest.mock("bugfixes", () => ({
	error: jest.fn(),
	loadConfigFromEnv: jest.fn(),
	setDefaultConfig: jest.fn(),
}));

import { error } from "bugfixes";
import { reportError } from "./bugfixes";

describe("reportError", () => {
	beforeEach(() => (error as jest.Mock).mockClear());

	it("sends plain objects as JSON", () => {
		reportError("db:", { message: "boom", code: "23505" });
		expect(error).toHaveBeenCalledWith(
			"db:",
			'{"message":"boom","code":"23505"}',
		);
	});

	it("doesn't throw on circular or BigInt values (RB-33)", () => {
		const circular: Record<string, unknown> = {};
		circular.self = circular;
		expect(() => reportError("x", circular, { n: BigInt(1) })).not.toThrow();
		expect(error).toHaveBeenCalledWith(
			"x",
			"[object Object]",
			"[object Object]",
		);
	});
});
