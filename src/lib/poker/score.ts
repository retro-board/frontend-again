import { ESTIMATION_VALUES, type EstimationType } from "~/types/database";

export const RESULT_METHODS = ["average", "mode"] as const;
export type ResultMethod = (typeof RESULT_METHODS)[number];

export const RESULT_METHOD_LABELS: Record<ResultMethod, string> = {
	average: "Average, snapped to the nearest card",
	mode: "Most common, facilitator breaks ties",
};

const SIZES = ["XS", "S", "M", "L", "XL", "XXL"];

// averageScore: the mean of the counted votes, rounded to the nearest card on the scale; "?" with none.
export function averageScore(
	votes: string[],
	type: EstimationType,
	allowed?: readonly string[],
): string {
	const scale = (allowed ?? ESTIMATION_VALUES[type]).filter(
		(value) => value !== "?",
	);
	const counted = votes.filter((value) => scale.includes(value));
	const numeric = counted
		.map((value) =>
			type === "tshirt" ? SIZES.indexOf(value) + 1 : Number(value),
		)
		.filter((value) => Number.isFinite(value));
	if (!numeric.length) return "?";
	const rounded = Math.round(
		numeric.reduce((total, value) => total + value, 0) / numeric.length,
	);
	let closest = scale[0];
	if (!closest) return "?";
	const number = (value: string) =>
		type === "tshirt" ? SIZES.indexOf(value) + 1 : Number(value);
	for (const card of scale)
		if (Math.abs(number(card) - rounded) < Math.abs(number(closest) - rounded))
			closest = card;
	return closest;
}

// mostCommon: the card(s) with the most counted votes, in scale order; [] with none.
export function mostCommon(
	votes: string[],
	type: EstimationType,
	allowed?: readonly string[],
): string[] {
	const cards: string[] = (allowed ?? ESTIMATION_VALUES[type]).filter(
		(v) => v !== "?",
	);
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
	allowed?: readonly string[],
): ScoreResult {
	if (method !== "mode")
		return { finalScore: averageScore(votes, type, allowed), tiedValues: null };
	const top = mostCommon(votes, type, allowed);
	if (top.length <= 1) return { finalScore: top[0] ?? "?", tiedValues: null };
	if (pick && top.includes(pick)) return { finalScore: pick, tiedValues: top };
	return { tie: top };
}
