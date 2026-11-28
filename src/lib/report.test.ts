import {
	allowReport,
	cleanReport,
	isRequestNoise,
	resetReportLimits,
} from "./report";

describe("isRequestNoise", () => {
	const err = (message: string, extra: object = {}) =>
		Object.assign(new Error(message), extra);

	it("drops hung-up clients and unknown Server Actions, nothing else", () => {
		expect(isRequestNoise(err("aborted"))).toBe(true);
		expect(
			isRequestNoise(
				err("Failed to find Server Action. This request might be"),
			),
		).toBe(true);
		expect(isRequestNoise(err("query aborted by the database"))).toBe(false);
	});

	it("drops malformed multipart bodies (RB-38, RB-39)", () => {
		expect(
			isRequestNoise(err("missing final boundary while parsing FormData")),
		).toBe(true);
	});

	it("drops other client-abort shapes (RB-34)", () => {
		expect(
			isRequestNoise(err("This operation was aborted", { name: "AbortError" })),
		).toBe(true);
		expect(isRequestNoise(err("socket hang up", { code: "ECONNRESET" }))).toBe(
			true,
		);
		expect(
			isRequestNoise(err("connect ECONNREFUSED", { code: "ECONNREFUSED" })),
		).toBe(false);
	});
});

describe("cleanReport", () => {
	it("returns null without a message", () => {
		expect(cleanReport(null)).toBeNull();
		expect(cleanReport({ message: "  " })).toBeNull();
	});

	it("strips the query and clips fields", () => {
		const r = cleanReport({
			kind: "nope",
			message: "x".repeat(2000),
			stack: 5,
			path: "/boards/1?invite=secret#a",
		});
		expect(r).toEqual({
			kind: "error",
			message: "x".repeat(1000),
			stack: "",
			path: "/boards/1",
		});
	});
});

describe("allowReport", () => {
	beforeEach(resetReportLimits);

	it("allows 10 a minute per address", () => {
		for (let i = 0; i < 10; i++) expect(allowReport("a", 0)).toBe(true);
		expect(allowReport("a", 0)).toBe(false);
		expect(allowReport("b", 0)).toBe(true);
		expect(allowReport("a", 60_001)).toBe(true);
	});

	it("allows 100 a minute in all", () => {
		for (let i = 0; i < 100; i++) allowReport(`ip${i}`, 0);
		expect(allowReport("new", 0)).toBe(false);
	});
});
