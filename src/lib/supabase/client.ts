import { createClient } from "@supabase/supabase-js";
import { env } from "~/env";

export const supabase = createClient(
	env.NEXT_PUBLIC_SUPABASE_URL,
	env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
	{
		realtime: {
			params: {
				eventsPerSecond: 10, // Increase real-time throughput
			},
		},
		db: {
			schema: "public",
		},
		auth: {
			persistSession: false, // We're using Clerk for auth
		},
	}
);
