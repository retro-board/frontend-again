import { z } from "zod";

const storyId = z.string().uuid();
// Identity and roles are supplied by the server after parsing; client claims are stripped.
export const pokerMessage = z.discriminatedUnion("type", [
	z.object({ type: z.literal("join") }),
	z.object({ type: z.literal("leave") }),
	z.object({ type: z.literal("abstain") }),
	z.object({ type: z.literal("unabstain") }),
	z.object({
		type: z.literal("vote"),
		storyId,
		voteValue: z.string().min(1).max(20),
	}),
	z.object({
		type: z.literal("timer_start"),
		duration: z.number().positive().max(86400),
	}),
	z.object({ type: z.literal("timer_stop") }),
	z.object({
		type: z.literal("story_create"),
		story: z.object({
			id: storyId,
			title: z.string().min(1).max(2000),
			description: z.string().max(10000).optional(),
			position: z.number().int().nonnegative(),
		}),
	}),
	z.object({
		type: z.literal("story_select"),
		storyId,
		storyTitle: z.string().max(2000),
	}),
	z.object({ type: z.literal("voting_start"), storyId }),
	z.object({ type: z.literal("voting_end"), storyId }),
	z.object({
		type: z.literal("score_calculated"),
		storyId,
		finalScore: z.string().max(20),
		votes: z.record(z.string(), z.string().max(20)),
	}),
]);
