import { averageScore, mostCommon, scoreVotes } from "./score";

describe("averageScore (unchanged behaviour)", () => {
	it("snaps the mean to the nearest card on each scale", () => {
		expect(averageScore(["3", "5", "8"], "fibonacci")).toBe("5");
		expect(averageScore(["3", "5"], "fibonacci")).toBe("3"); // 4: 3 and 5 are equally near, lower wins
		expect(averageScore(["S", "M", "L"], "tshirt")).toBe("M");
		expect(averageScore(["XL", "XXL"], "tshirt")).toBe("XXL");
		expect(averageScore(["3", "4", "6"], "oneToTen")).toBe("4");
	});

	it("leaves out ? and gives ? with nothing counted", () => {
		expect(averageScore(["?", "8"], "fibonacci")).toBe("8");
		expect(averageScore(["?", "?"], "fibonacci")).toBe("?");
		expect(averageScore([], "tshirt")).toBe("?");
	});
});

describe("mostCommon", () => {
	it("finds a clear winner and leaves out ? and abstain", () => {
		expect(
			mostCommon(["5", "5", "8", "?", "?", "?", "abstain"], "fibonacci"),
		).toEqual(["5"]);
		expect(mostCommon(["M", "L", "M"], "tshirt")).toEqual(["M"]);
	});

	it("returns every tied card in scale order", () => {
		expect(mostCommon(["8", "3", "8", "3"], "fibonacci")).toEqual(["3", "8"]);
	});

	it("returns nothing with no counted votes", () => {
		expect(mostCommon(["?", "abstain"], "fibonacci")).toEqual([]);
	});
});

describe("scoreVotes", () => {
	it("defaults to the average", () => {
		expect(scoreVotes(["3", "5", "8"], "fibonacci", "average")).toEqual({
			finalScore: "5",
			tiedValues: null,
		});
	});

	it("uses the most common card in mode", () => {
		expect(scoreVotes(["3", "13", "13"], "fibonacci", "mode")).toEqual({
			finalScore: "13",
			tiedValues: null,
		});
	});

	it("waits on a tie, then takes the facilitator's pick", () => {
		expect(scoreVotes(["S", "L"], "tshirt", "mode")).toEqual({
			tie: ["S", "L"],
		});
		expect(scoreVotes(["S", "L"], "tshirt", "mode", "XL")).toEqual({
			tie: ["S", "L"],
		});
		expect(scoreVotes(["S", "L"], "tshirt", "mode", "L")).toEqual({
			finalScore: "L",
			tiedValues: ["S", "L"],
		});
	});

	it("gives ? in mode with no counted votes", () => {
		expect(scoreVotes(["?"], "oneToTen", "mode")).toEqual({
			finalScore: "?",
			tiedValues: null,
		});
	});
});

describe("TrackLin.es board card sets", () => {
	it("snaps both new numeric scales and excludes non-card values", () => {
		expect(averageScore(["2", "4", "8"], "powers")).toBe("4");
		expect(averageScore(["1", "4", "5"], "linear")).toBe("3");
		expect(averageScore(["?", "abstain", "999"], "powers")).toBe("?");
	});
	it("limits fibonacci and tshirt results to the connected board's actual cards", () => {
		expect(
			averageScore(["21", "89"], "fibonacci", [
				"1",
				"2",
				"3",
				"5",
				"8",
				"13",
				"21",
			]),
		).toBe("21");
		expect(
			averageScore(["XL", "XXL"], "tshirt", ["XS", "S", "M", "L", "XL"]),
		).toBe("XL");
		expect(
			mostCommon(["XXL", "XL"], "tshirt", ["XS", "S", "M", "L", "XL"]),
		).toEqual(["XL"]);
	});
	it("supports both result methods and a facilitator-decided tie on powers", () => {
		expect(scoreVotes(["2", "8", "8"], "powers", "average")).toEqual({
			finalScore: "4",
			tiedValues: null,
		});
		expect(scoreVotes(["2", "8", "8"], "powers", "mode")).toEqual({
			finalScore: "8",
			tiedValues: null,
		});
		expect(scoreVotes(["2", "8"], "powers", "mode")).toEqual({
			tie: ["2", "8"],
		});
		expect(scoreVotes(["2", "8"], "powers", "mode", "8")).toEqual({
			finalScore: "8",
			tiedValues: ["2", "8"],
		});
	});
});
