import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { env } from "~/env";

// Create admin client with service role key
const supabaseAdmin = createClient(
	env.NEXT_PUBLIC_SUPABASE_URL,
	env.SUPABASE_SERVICE_ROLE_KEY,
	{
		auth: {
			autoRefreshToken: false,
			persistSession: false,
		},
	},
);

export async function POST(
	request: Request,
	{ params }: { params: { sessionId: string } },
) {
	try {
		const { userId } = await auth();

		if (!userId) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const body = await request.json();
		const { storyId, vote } = body;

		// Get user from database
		const { data: dbUser } = await supabaseAdmin
			.from("users")
			.select("id")
			.eq("clerk_id", userId)
			.maybeSingle();

		if (!dbUser) {
			return NextResponse.json({ error: "User not found" }, { status: 404 });
		}

		// Check if user is participant
		const { data: participant } = await supabaseAdmin
			.from("poker_participants")
			.select("*")
			.eq("session_id", params.sessionId)
			.eq("user_id", dbUser.id)
			.maybeSingle();

		if (!participant) {
			return NextResponse.json(
				{ error: "Not authorized to vote in this session" },
				{ status: 403 },
			);
		}

		// Check if user already voted
		const { data: existingVote } = await supabaseAdmin
			.from("poker_votes")
			.select("id")
			.eq("story_id", storyId)
			.eq("user_id", dbUser.id)
			.maybeSingle();

		if (existingVote) {
			// Update existing vote
			const { error } = await supabaseAdmin
				.from("poker_votes")
				.update({ vote_value: vote })
				.eq("id", existingVote.id);

			if (error) {
				console.error("Error updating vote:", error);
				return NextResponse.json({ error: error.message }, { status: 500 });
			}
		} else {
			// Create new vote
			const { error } = await supabaseAdmin.from("poker_votes").insert({
				story_id: storyId,
				user_id: dbUser.id,
				vote_value: vote,
			});

			if (error) {
				console.error("Error creating vote:", error);
				return NextResponse.json({ error: error.message }, { status: 500 });
			}
		}

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error("Vote error:", error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			{ status: 500 },
		);
	}
}
