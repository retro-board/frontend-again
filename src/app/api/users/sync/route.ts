import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { env } from "~/env";

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { email, name, avatar_url } = body;

    // Create a Supabase client - use anon key for now since service role key is optional
    const supabaseClient = createClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    // Check if user already exists
    const { data: existingUser, error: checkError } = await supabaseClient
      .from("users")
      .select("id")
      .eq("clerk_id", userId)
      .maybeSingle();

    if (checkError && checkError.code !== "PGRST116") {
      console.error("Error checking user:", checkError);
      return NextResponse.json({ error: checkError.message }, { status: 500 });
    }

    if (existingUser) {
      return NextResponse.json({ user: existingUser });
    }

    // Create new user - first try with regular client
    const { data: newUser, error } = await supabaseClient
      .from("users")
      .insert({
        clerk_id: userId,
        email,
        name,
        avatar_url,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating user with anon key:", error);
      
      // If RLS is blocking, try with service role key if available
      if (env.SUPABASE_SERVICE_ROLE_KEY) {
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
        
        const { data: adminUser, error: adminError } = await supabaseAdmin
          .from("users")
          .insert({
            clerk_id: userId,
            email,
            name,
            avatar_url,
          })
          .select()
          .single();
          
        if (adminError) {
          console.error("Error creating user with service key:", adminError);
          return NextResponse.json({ error: adminError.message }, { status: 500 });
        }
        
        return NextResponse.json({ user: adminUser });
      }
      
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ user: newUser });
  } catch (error) {
    console.error("Sync user error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}