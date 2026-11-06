import { allowReport, cleanReport, resetReportLimits } from "./report";

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
