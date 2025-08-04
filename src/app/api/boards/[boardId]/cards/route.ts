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
  { params }: { params: { boardId: string } }
) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { column_id, content, position } = body;

    // Get user from database
    const { data: dbUser } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("clerk_id", userId)
      .maybeSingle();

    if (!dbUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Check if user is participant of this board
    const { data: participant } = await supabaseAdmin
      .from("board_participants")
      .select("*")
      .eq("board_id", params.boardId)
      .eq("user_id", dbUser.id)
      .maybeSingle();

    if (!participant) {
      return NextResponse.json({ error: "Not authorized to add cards to this board" }, { status: 403 });
    }

    // Create card
    const { data: card, error } = await supabaseAdmin
      .from("cards")
      .insert({
        column_id,
        content,
        author_id: dbUser.id,
        position,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating card:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ card });
  } catch (error) {
    console.error("Create card error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { boardId: string } }
) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { cardId, content, column_id, position } = body;

    // Get user from database
    const { data: dbUser } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("clerk_id", userId)
      .maybeSingle();

    if (!dbUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Build update object
    const updateData: any = { updated_at: new Date().toISOString() };
    if (content !== undefined) updateData.content = content;
    if (column_id !== undefined) updateData.column_id = column_id;
    if (position !== undefined) updateData.position = position;

    // Update card (only author can update content)
    const query = supabaseAdmin
      .from("cards")
      .update(updateData)
      .eq("id", cardId);

    // If updating content, ensure user is author
    if (content !== undefined) {
      query.eq("author_id", dbUser.id);
    }

    const { data: card, error } = await query.select().single();

    if (error) {
      console.error("Error updating card:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ card });
  } catch (error) {
    console.error("Update card error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { boardId: string } }
) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const cardId = searchParams.get("cardId");

    if (!cardId) {
      return NextResponse.json({ error: "Card ID required" }, { status: 400 });
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

    // Delete card (only author can delete)
    const { error } = await supabaseAdmin
      .from("cards")
      .delete()
      .eq("id", cardId)
      .eq("author_id", dbUser.id);

    if (error) {
      console.error("Error deleting card:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete card error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}