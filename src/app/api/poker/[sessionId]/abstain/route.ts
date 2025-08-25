import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "~/lib/supabase/admin";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const resolvedParams = await params;
    const { userId } = await auth();
    const body = await request.json();
    const { isAbstaining, anonymousUserId } = body;

    // Determine the user identifier
    let participantUserId: string | null = null;
    
    if (userId) {
      // Get user from database
      const { data: dbUser } = await supabaseAdmin
        .from("users")
        .select("id")
        .eq("clerk_id", userId)
        .single();
      
      if (dbUser) {
        participantUserId = dbUser.id;
      }
    }

    if (!participantUserId && !anonymousUserId) {
      return NextResponse.json(
        { error: "User identification required" },
        { status: 401 }
      );
    }

    // Update abstention status
    if (participantUserId) {
      const { error } = await supabaseAdmin
        .from("poker_participants")
        .update({ is_abstaining: isAbstaining })
        .eq("session_id", resolvedParams.sessionId)
        .eq("user_id", participantUserId);

      if (error) {
        console.error("Error updating abstention:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else {
      // For anonymous users, we'll track this in session state only
      // The channel message will handle updating client state
    }

    return NextResponse.json({ success: true, isAbstaining });
  } catch (error) {
    console.error("Abstain error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}