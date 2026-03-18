import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "~/env";

let _supabaseAdmin: SupabaseClient | null = null;

// This client bypasses RLS - use only for user creation
// Lazily initialized to avoid throwing during build-time page data collection
export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
	get(_target, prop, receiver) {
		if (!_supabaseAdmin) {
			if (!env.SUPABASE_SERVICE_ROLE_KEY) {
				throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
			}
			_supabaseAdmin = createClient(
				env.NEXT_PUBLIC_SUPABASE_URL,
				env.SUPABASE_SERVICE_ROLE_KEY,
				{
					auth: {
						autoRefreshToken: false,
						persistSession: false,
					},
				},
			);
		}
		return Reflect.get(_supabaseAdmin, prop, receiver);
	},
});
