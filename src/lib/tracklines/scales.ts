import type { EstimationType } from "~/types/database";
// Mirrors TrackLin.es' board scales. Normal poker retains its existing, wider card sets.
export const TRACKLINES_SCALES = {
	fibonacci: ["1", "2", "3", "5", "8", "13", "21"],
	tshirt: ["XS", "S", "M", "L", "XL"],
	powers: ["1", "2", "4", "8", "16"],
	linear: ["1", "2", "3", "4", "5"],
} as const;
export function tracklinesScale(scale?: string): {
	type: EstimationType;
	values: string[];
} {
	if (!scale || !Object.hasOwn(TRACKLINES_SCALES, scale))
		throw new Error("Choose a TrackLin.es board with an estimate scale");
	const type = scale as keyof typeof TRACKLINES_SCALES;
	return { type, values: [...TRACKLINES_SCALES[type]] };
}
