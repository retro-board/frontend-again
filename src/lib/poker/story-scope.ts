import { db } from "~/lib/db";
import { ESTIMATION_VALUES, type EstimationType } from "~/types/database";

export async function sessionHasStory(sessionId: string, storyId: unknown) {
	if (typeof storyId !== "string" || !storyId) return false;
	const { data, error } = await db
		.from("stories")
		.select("id")
		.eq("id", storyId)
		.eq("session_id", sessionId)
		.maybeSingle();
	if (error) throw new Error("Story lookup failed");
	return !!data;
}
export function validPokerVote(
	vote: unknown,
	type: EstimationType,
	allowed?: string[] | null,
) {
	const values: readonly string[] = allowed ?? ESTIMATION_VALUES[type] ?? [];
	return (
		typeof vote === "string" &&
		(vote === "?" || vote === "abstain" || values.includes(vote))
	);
}
