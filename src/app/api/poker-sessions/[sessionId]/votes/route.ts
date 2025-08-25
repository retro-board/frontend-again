import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { supabaseAdmin } from "~/lib/supabase/admin";
import { PokerChannelClient } from "~/lib/supabase/poker-channel";
export async function POST(
	request: Request,
	{ params }: { params: Promise<{ sessionId: string }> },
) {
	try {
		const resolvedParams = await params;
		const { userId } = await auth();
		const cookieStore = await cookies();
		const anonymousSessionId = cookieStore.get("anonymous_session_id")?.value;

		console.log("Vote request:", { userId, anonymousSessionId });

		if (!userId && !anonymousSessionId) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const body = await request.json();
		const { storyId, vote } = body;
		console.log("Vote data:", { storyId, vote });

		let dbUserId: string | null = null;
		let anonymousUserId: string | null = null;
		let isAuthorized = false;

		if (userId) {
			// Get user from database
			const { data: dbUser } = await supabaseAdmin
				.from("users")
				.select("id")
				.eq("clerk_id", userId)
				.maybeSingle();

			if (!dbUser) {
				return NextResponse.json({ error: "User not found" }, { status: 404 });
			}

			dbUserId = dbUser.id;

			// Check if user is participant
			const { data: participant } = await supabaseAdmin
				.from("poker_participants")
				.select("*")
				.eq("session_id", resolvedParams.sessionId)
				.eq("user_id", dbUser.id)
				.maybeSingle();

			if (participant) {
				isAuthorized = true;
			}
		} else if (anonymousSessionId) {
			// Get anonymous user
			const { data: anonymousUser } = await supabaseAdmin
				.from("anonymous_users")
				.select("id")
				.eq("session_id", anonymousSessionId)
				.maybeSingle();

			if (!anonymousUser) {
				console.error(
					"Anonymous user not found for session:",
					anonymousSessionId,
				);
				return NextResponse.json(
					{ error: "Anonymous user not found" },
					{ status: 404 },
				);
			}

			anonymousUserId = anonymousUser.id;
			console.log("Found anonymous user:", anonymousUserId);

			// Check if anonymous user is participant
			const { data: participant } = await supabaseAdmin
				.from("poker_anonymous_participants")
				.select("*")
				.eq("session_id", resolvedParams.sessionId)
				.eq("anonymous_user_id", anonymousUser.id)
				.maybeSingle();

			if (participant) {
				isAuthorized = true;
				console.log("Anonymous user is participant");
			} else {
				console.log(
					"Anonymous user is NOT participant of session:",
					resolvedParams.sessionId,
				);
			}
		}

		if (!isAuthorized) {
			console.error("User not authorized to vote");
			return NextResponse.json(
				{ error: "Not authorized to vote in this session" },
				{ status: 403 },
			);
		}

		// Check if user already voted
		let existingVote = null;
		if (dbUserId) {
			const { data } = await supabaseAdmin
				.from("poker_votes")
				.select("id")
				.eq("story_id", storyId)
				.eq("user_id", dbUserId)
				.maybeSingle();
			existingVote = data;
		} else if (anonymousUserId) {
			const { data } = await supabaseAdmin
				.from("poker_votes")
				.select("id")
				.eq("story_id", storyId)
				.eq("anonymous_user_id", anonymousUserId)
				.maybeSingle();
			existingVote = data;
		}

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
			const voteData: {
				story_id: string;
				vote_value: string;
				user_id?: string;
				anonymous_user_id?: string;
			} = {
				story_id: storyId,
				vote_value: vote,
			};

			if (dbUserId) {
				voteData.user_id = dbUserId;
			} else if (anonymousUserId) {
				voteData.anonymous_user_id = anonymousUserId;
			}

			const { error } = await supabaseAdmin
				.from("poker_votes")
				.insert(voteData);

			if (error) {
				console.error("Error creating vote:", error);
				console.error("Vote data that failed:", voteData);
				return NextResponse.json(
					{
						error: error.message,
						details: error.details || error.hint || "No additional details",
						code: error.code,
					},
					{ status: 500 },
				);
			}
		}

		// Broadcast vote to channel
		try {
			const channel = new PokerChannelClient(
				resolvedParams.sessionId,
				supabaseAdmin,
			);

			// Get user name for broadcasting
			let userName = "Anonymous";
			if (dbUserId) {
				const { data: user } = await supabaseAdmin
					.from("users")
					.select("name")
					.eq("id", dbUserId)
					.single();
				if (user) userName = user.name;
			} else if (anonymousUserId) {
				const { data: anonUser } = await supabaseAdmin
					.from("anonymous_users")
					.select("display_name")
					.eq("id", anonymousUserId)
					.single();
				if (anonUser) userName = anonUser.display_name;
			}

			await channel.connect(
				dbUserId || undefined,
				anonymousUserId || undefined,
			);
			await channel.vote(
				storyId,
				vote,
				dbUserId || undefined,
				anonymousUserId || undefined,
				userName,
			);
			await channel.disconnect();
		} catch (channelError) {
			console.error("Error broadcasting vote:", channelError);
			// Don't fail the request if broadcasting fails
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

export async function DELETE(
	request: Request,
	{ params }: { params: Promise<{ sessionId: string }> },
) {
	try {
		const resolvedParams = await params;
		const { userId } = await auth();

		if (!userId) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		// Get user from database
		const { data: dbUser } = await supabaseAdmin
			.from("users")
			.select("id")
			.eq("clerk_id", userId)
			.single();

		if (!dbUser) {
			return NextResponse.json({ error: "User not found" }, { status: 404 });
		}

		// Check if user is the facilitator
		const { data: session } = await supabaseAdmin
			.from("poker_sessions")
			.select("created_by")
			.eq("id", resolvedParams.sessionId)
			.single();

		if (!session || session.created_by !== dbUser.id) {
			return NextResponse.json(
				{ error: "Only facilitator can reset votes" },
				{ status: 403 },
			);
		}

		const body = await request.json();
		const { storyId } = body;

		// Delete all votes for this story
		const { error: deleteError } = await supabaseAdmin
			.from("poker_votes")
			.delete()
			.eq("story_id", storyId);

		if (deleteError) {
			return NextResponse.json(
				{ error: "Failed to delete votes" },
				{ status: 500 },
			);
		}

		// Also clear the final_estimate for the story
		const { error: updateError } = await supabaseAdmin
			.from("poker_stories")
			.update({ final_estimate: null, estimated_at: null })
			.eq("id", storyId);

		if (updateError) {
			console.error("Error clearing story estimate:", updateError);
		}

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error("Error deleting votes:", error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			{ status: 500 },
		);
	}
}
