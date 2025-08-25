import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "~/lib/supabase/admin";
import { ESTIMATION_VALUES } from "~/types/database";

// Calculate the mean score and round to nearest valid estimation value
function calculateScore(
	votes: string[],
	estimationType: keyof typeof ESTIMATION_VALUES,
): string {
	const validValues = ESTIMATION_VALUES[estimationType];

	// Filter out question marks and non-numeric values for calculation
	const numericVotes = votes.filter((v) => v !== "?");

	if (numericVotes.length === 0) {
		return "?";
	}

	// Convert to numeric values for calculation
	let numericValues: number[] = [];

	if (estimationType === "fibonacci" || estimationType === "oneToTen") {
		numericValues = numericVotes
			.map((v) => Number.parseInt(v, 10))
			.filter((n) => !Number.isNaN(n));
	} else if (estimationType === "tshirt") {
		// Map t-shirt sizes to numeric values
		const sizeMap: Record<string, number> = {
			XS: 1,
			S: 2,
			M: 3,
			L: 4,
			XL: 5,
			XXL: 6,
		};
		numericValues = numericVotes
			.map((v) => sizeMap[v] || 0)
			.filter((n) => n > 0);
	}

	if (numericValues.length === 0) {
		return "?";
	}

	// Calculate mean
	const mean =
		numericValues.reduce((sum, val) => sum + val, 0) / numericValues.length;

	// Round to nearest integer
	const rounded = Math.round(mean);

	if (estimationType === "fibonacci" || estimationType === "oneToTen") {
		// Find the nearest valid value
		const numericValid = validValues
			.filter((v) => v !== "?")
			.map((v) => Number.parseInt(v, 10))
			.filter((n) => !Number.isNaN(n))
			.sort((a, b) => a - b);

		// Find the closest value to the rounded mean
		if (numericValid.length === 0) {
			return "?";
		}
		
		const firstValue = numericValid[0];
		if (firstValue === undefined) {
			return "?";
		}
		
		let closest = firstValue;
		let minDiff = Math.abs(closest - rounded);
		
		for (const val of numericValid) {
			const diff = Math.abs(val - rounded);
			if (diff < minDiff) {
				minDiff = diff;
				closest = val;
			}
		}
		
		return closest.toString();
	}

	if (estimationType === "tshirt") {
		const sizes = ["XS", "S", "M", "L", "XL", "XXL"];
		const index = Math.min(rounded - 1, sizes.length - 1);
		return sizes[Math.max(0, index)] ?? "?";
	}

	return "?";
}

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ sessionId: string }> },
) {
	try {
		const resolvedParams = await params;
		const { userId } = await auth();
		const { storyId } = await request.json();

		if (!userId) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		// Get user from database
		const { data: dbUser } = await supabaseAdmin
			.from("users")
			.select("id")
			.eq("clerk_id", userId)
			.maybeSingle();

		if (!dbUser) {
			return NextResponse.json({ error: "User not found" }, { status: 404 });
		}

		// Check if user is facilitator
		const { data: facilitator } = await supabaseAdmin
			.from("poker_participants")
			.select("*")
			.eq("session_id", resolvedParams.sessionId)
			.eq("user_id", dbUser.id)
			.eq("role", "facilitator")
			.maybeSingle();

		if (!facilitator) {
			return NextResponse.json(
				{ error: "Only facilitators can calculate scores" },
				{ status: 403 },
			);
		}

		// Get session
		const { data: session } = await supabaseAdmin
			.from("poker_sessions")
			.select("estimation_type")
			.eq("id", resolvedParams.sessionId)
			.single();

		if (!session) {
			return NextResponse.json({ error: "Session not found" }, { status: 404 });
		}

		// Get all votes for this story (excluding abstainers)
		const { data: votes } = await supabaseAdmin
			.from("poker_votes")
			.select(`
				vote_value,
				user_id,
				anonymous_user_id,
				users!poker_votes_user_id_fkey(name, email),
				anonymous_users(display_name)
			`)
			.eq("story_id", storyId)
			.neq("vote_value", "abstain");

		if (!votes || votes.length === 0) {
			return NextResponse.json(
				{ error: "No votes found for this story" },
				{ status: 404 },
			);
		}

		// Calculate the final score
		const voteValues = votes.map((v) => v.vote_value);
		const finalScore = calculateScore(voteValues, session.estimation_type);

		// Update the story with the final estimate
		await supabaseAdmin
			.from("stories")
			.update({
				final_estimate: finalScore,
				is_estimated: true,
				estimated_at: new Date().toISOString(),
			})
			.eq("id", storyId);

		// Format votes for response
		const voteMap: Record<string, string> = {};
		for (const vote of votes) {
			const user = vote.users as any;
			const anonUser = vote.anonymous_users as any;
			const voterName =
				user?.name || user?.email || anonUser?.display_name || "Anonymous";
			voteMap[voterName] = vote.vote_value;
		}

		return NextResponse.json({
			finalScore,
			votes: voteMap,
		});
	} catch (error) {
		console.error("Score calculation error:", error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			{ status: 500 },
		);
	}
}
