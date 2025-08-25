import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "~/lib/supabase/admin";
import { ESTIMATION_VALUES } from "~/types/database";

// Calculate the mean score and round up to nearest valid estimation value
function calculateScore(
  votes: string[],
  estimationType: keyof typeof ESTIMATION_VALUES
): string {
  const validValues = ESTIMATION_VALUES[estimationType];
  
  // Filter out question marks and non-numeric values for calculation
  const numericVotes = votes.filter(v => v !== "?");
  
  if (numericVotes.length === 0) {
    return "?";
  }

  // Convert to numeric values for calculation
  let numericValues: number[] = [];
  
  if (estimationType === "fibonacci" || estimationType === "oneToTen") {
    numericValues = numericVotes.map(v => parseInt(v, 10)).filter(n => !isNaN(n));
  } else if (estimationType === "tshirt") {
    // Map t-shirt sizes to numeric values
    const sizeMap: Record<string, number> = {
      "XS": 1,
      "S": 2,
      "M": 3,
      "L": 4,
      "XL": 5,
      "XXL": 6,
    };
    numericValues = numericVotes.map(v => sizeMap[v] || 0).filter(n => n > 0);
  }

  if (numericValues.length === 0) {
    return "?";
  }

  // Calculate mean
  const mean = numericValues.reduce((sum, val) => sum + val, 0) / numericValues.length;
  
  // Round up and find nearest valid value
  const roundedUp = Math.ceil(mean);
  
  if (estimationType === "fibonacci") {
    // Find the smallest fibonacci number >= roundedUp
    const fibValues = validValues
      .filter(v => v !== "?")
      .map(v => parseInt(v, 10))
      .filter(n => !isNaN(n))
      .sort((a, b) => a - b);
    
    const result = fibValues.find(v => v >= roundedUp);
    return result ? result.toString() : fibValues[fibValues.length - 1].toString();
  } else if (estimationType === "oneToTen") {
    const clamped = Math.min(Math.max(roundedUp, 1), 10);
    return clamped.toString();
  } else if (estimationType === "tshirt") {
    const sizes = ["XS", "S", "M", "L", "XL", "XXL"];
    const index = Math.min(Math.max(roundedUp - 1, 0), sizes.length - 1);
    return sizes[index];
  }

  return "?";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const resolvedParams = await params;
    const { userId } = await auth();
    const body = await request.json();
    const { storyId } = body;

    if (!storyId) {
      return NextResponse.json(
        { error: "Story ID required" },
        { status: 400 }
      );
    }

    // Get session details
    const { data: session, error: sessionError } = await supabaseAdmin
      .from("poker_sessions")
      .select("*, owner:users!poker_sessions_owner_id_fkey(*)")
      .eq("id", resolvedParams.sessionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    // Verify user is the facilitator
    if (userId) {
      const { data: dbUser } = await supabaseAdmin
        .from("users")
        .select("id")
        .eq("clerk_id", userId)
        .single();

      if (!dbUser || dbUser.id !== session.owner_id) {
        return NextResponse.json(
          { error: "Only the facilitator can calculate scores" },
          { status: 403 }
        );
      }
    }

    // Get all votes for the story
    const { data: votes, error: votesError } = await supabaseAdmin
      .from("poker_votes")
      .select("*")
      .eq("story_id", storyId);

    if (votesError) {
      console.error("Error fetching votes:", votesError);
      return NextResponse.json({ error: votesError.message }, { status: 500 });
    }

    if (!votes || votes.length === 0) {
      return NextResponse.json(
        { error: "No votes to calculate" },
        { status: 400 }
      );
    }

    // Get participants to check for abstentions
    const { data: participants } = await supabaseAdmin
      .from("poker_participants")
      .select("*")
      .eq("session_id", resolvedParams.sessionId)
      .eq("role", "voter");

    // Filter out abstaining participants
    const activeParticipants = participants?.filter(p => !p.is_abstaining) || [];
    const activeParticipantIds = activeParticipants.map(p => p.user_id);
    
    // Filter votes to only include non-abstaining participants
    const activeVotes = votes.filter(v => 
      v.user_id ? activeParticipantIds.includes(v.user_id) : true
    );

    // Calculate the score
    const voteValues = activeVotes.map(v => v.vote_value);
    const finalScore = calculateScore(voteValues, session.estimation_type);

    // Update the story with the final estimate
    const { error: updateError } = await supabaseAdmin
      .from("stories")
      .update({
        final_estimate: finalScore,
        is_estimated: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", storyId);

    if (updateError) {
      console.error("Error updating story:", updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Create a votes map for the response
    const votesMap: Record<string, string> = {};
    activeVotes.forEach(v => {
      const key = v.user_id || v.anonymous_user_id || "unknown";
      votesMap[key] = v.vote_value;
    });

    return NextResponse.json({
      success: true,
      finalScore,
      votes: votesMap,
      totalVotes: activeVotes.length,
      eligibleVoters: activeParticipants.length,
    });
  } catch (error) {
    console.error("Score calculation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}