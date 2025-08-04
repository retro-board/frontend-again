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

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, description } = body;

    // Get user from database
    const { data: dbUser, error: userError } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("clerk_id", userId)
      .maybeSingle();

    if (userError) {
      console.error("Error fetching user:", userError);
      return NextResponse.json({ error: userError.message }, { status: 500 });
    }

    if (!dbUser) {
      return NextResponse.json({ error: "User not found in database" }, { status: 404 });
    }

    // Create board
    const { data: board, error: boardError } = await supabaseAdmin
      .from("boards")
      .insert({
        name,
        description,
        owner_id: dbUser.id,
      })
      .select()
      .single();

    if (boardError) {
      console.error("Error creating board:", boardError);
      return NextResponse.json({ error: boardError.message }, { status: 500 });
    }

    // Add owner as participant
    const { error: participantError } = await supabaseAdmin
      .from("board_participants")
      .insert({
        board_id: board.id,
        user_id: dbUser.id,
        role: "owner",
      });

    if (participantError) {
      console.error("Error adding participant:", participantError);
      // Don't fail the whole operation if participant add fails
    }

    return NextResponse.json({ board });
  } catch (error) {
    console.error("Create board error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}