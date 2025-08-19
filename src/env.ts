import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const flagConfig = {
	projectId: "ce70ace8-9516-4c18-ae62-1f9b1b1d2b33",
	agentId: "281f691b-f932-4d50-8fce-4bdf037fe6cb",
	environmentId: "",
};

export const env = createEnv({
	/**
	 * Specify your server-side environment variables schema here. This way you can ensure the app
	 * isn't built with invalid env vars.
	 */
	server: {
		NODE_ENV: z.enum(["development", "test", "production"]),

		UPLOADTHING_TOKEN: z.string().optional(),

		CLERK_SECRET_KEY: z.string().optional(),

		SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
		SUPABASE_JWT_SECRET: z.string().optional(),
	},

	/**
	 * Specify your client-side environment variables schema here. This way you can ensure the app
	 * isn't built with invalid env vars. To expose them to the client, prefix them with
	 * `NEXT_PUBLIC_`.
	 */
	client: {
		NEXT_PUBLIC_FLAGS_ENVIRONMENT: z.string().optional(),

		NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().optional(),

		NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
		NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string(),
	},

	/**
	 * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
	 * middlewares) or client-side so we need to destruct manually.
	 */
	runtimeEnv: {
		NODE_ENV: process.env.NODE_ENV,

		UPLOADTHING_TOKEN: process.env.UPLOADTHING_TOKEN,

		NEXT_PUBLIC_FLAGS_ENVIRONMENT: process.env.NEXT_PUBLIC_FLAGS_ENVIRONMENT,

		NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
			process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,

		CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,

		NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
		NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
		SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
		SUPABASE_JWT_SECRET: process.env.SUPABASE_JWT_SECRET,
	},
	/**
	 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
	 * useful for Docker builds.
	 */
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
	/**
	 * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
	 * `SOME_VAR=''` will throw an error.
	 */
	emptyStringAsUndefined: true,
});
