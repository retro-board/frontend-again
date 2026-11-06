import { ESTIMATION_VALUES, type EstimationType } from "~/types/database";

export const RESULT_METHODS = ["average", "mode"] as const;
export type ResultMethod = (typeof RESULT_METHODS)[number];

export const RESULT_METHOD_LABELS: Record<ResultMethod, string> = {
	average: "Average, snapped to the nearest card",
	mode: "Most common, facilitator breaks ties",
};

const SIZES = ["XS", "S", "M", "L", "XL", "XXL"];

// averageScore: the mean of the counted votes, rounded to the nearest card on the scale; "?" with none.
export function averageScore(votes: string[], type: EstimationType): string {
	const numeric =
		type === "tshirt"
			? votes.map((v) => SIZES.indexOf(v) + 1).filter((n) => n > 0)
			: votes
					.map((v) => Number.parseInt(v, 10))
					.filter((n) => !Number.isNaN(n));
	if (numeric.length === 0) return "?";
	const rounded = Math.round(
		numeric.reduce((a, b) => a + b, 0) / numeric.length,
	);

	if (type === "tshirt")
		return SIZES[Math.min(Math.max(rounded - 1, 0), SIZES.length - 1)] ?? "?";

	const cards = ESTIMATION_VALUES[type]
		.map((v) => Number.parseInt(v, 10))
		.filter((n) => !Number.isNaN(n));
	let closest = cards[0];
	if (closest === undefined) return "?";
	for (const card of cards)
		if (Math.abs(card - rounded) < Math.abs(closest - rounded)) closest = card;
	return closest.toString();
}

// mostCommon: the card(s) with the most counted votes, in scale order; [] with none.
export function mostCommon(votes: string[], type: EstimationType): string[] {
	const cards: string[] = ESTIMATION_VALUES[type].filter((v) => v !== "?");
	const counts = new Map<string, number>();
	for (const v of votes)
		if (cards.includes(v)) counts.set(v, (counts.get(v) ?? 0) + 1);
	const max = Math.max(0, ...counts.values());
	return max ? cards.filter((c) => counts.get(c) === max) : [];
}

export type ScoreResult =
	| { finalScore: string; tiedValues: string[] | null }
	| { tie: string[] };

// scoreVotes works out a story's result. "?" and abstain votes never count. In "mode", a tie
// waits for the facilitator: pass their pick (one of the tied values) to settle it.
export function scoreVotes(
	votes: string[],
	type: EstimationType,
	method: ResultMethod,
	pick?: string,
): ScoreResult {
	if (method !== "mode")
		return { finalScore: averageScore(votes, type), tiedValues: null };
	const top = mostCommon(votes, type);
	if (top.length <= 1) return { finalScore: top[0] ?? "?", tiedValues: null };
	if (pick && top.includes(pick)) return { finalScore: pick, tiedValues: top };
	return { tie: top };
}
