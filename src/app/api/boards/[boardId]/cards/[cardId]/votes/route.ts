import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
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
  }
);

export async function POST(
  request: Request,
  { params }: { params: { boardId: string; cardId: string } }
) {
  try {
    const { userId } = await auth();
    
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

    // Check if user already voted
    const { data: existingVote } = await supabaseAdmin
      .from("card_votes")
      .select("id")
      .eq("card_id", params.cardId)
      .eq("user_id", dbUser.id)
      .maybeSingle();

    if (existingVote) {
      // Remove vote
      const { error } = await supabaseAdmin
        .from("card_votes")
        .delete()
        .eq("id", existingVote.id);

      if (error) {
        console.error("Error removing vote:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ voted: false });
    } else {
      // Add vote
      const { error } = await supabaseAdmin
        .from("card_votes")
        .insert({
          card_id: params.cardId,
          user_id: dbUser.id,
        });

      if (error) {
        console.error("Error adding vote:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ voted: true });
    }
  } catch (error) {
    console.error("Toggle vote error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}