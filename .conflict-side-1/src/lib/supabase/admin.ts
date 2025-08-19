import { createClient } from "@supabase/supabase-js";
import { env } from "~/env";

// Ensure service role key is available
if (!env.SUPABASE_SERVICE_ROLE_KEY) {
	throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
}

// This client bypasses RLS - use only for user creation
export const supabaseAdmin = createClient(
	env.NEXT_PUBLIC_SUPABASE_URL,
	env.SUPABASE_SERVICE_ROLE_KEY,
	{
		auth: {
			autoRefreshToken: false,
			persistSession: false,
		},
	},
);
