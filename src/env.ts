import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
	/**
	 * Specify your server-side environment variables schema here. This way you can ensure the app
	 * isn't built with invalid env vars.
	 */
	server: {
		DATABASE_URL: z.string().min(1),
		REDIS_URL: z.string().min(1),
		NODE_ENV: z.enum(["development", "test", "production"]),

		UPLOADTHING_TOKEN: z.string().optional(),

		CLERK_SECRET_KEY: z.string().optional(),
	},

	/**
	 * Specify your client-side environment variables schema here. This way you can ensure the app
	 * isn't built with invalid env vars. To expose them to the client, prefix them with
	 * `NEXT_PUBLIC_`.
	 */
	client: {
		NEXT_PUBLIC_FLAGS_PROJECT_ID: z.string().optional(),
		NEXT_PUBLIC_FLAGS_AGENT_ID: z.string().optional(),
		NEXT_PUBLIC_FLAGS_ENVIRONMENT: z.string().optional(),

		NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().optional(),
	},

	/**
	 * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
	 * middlewares) or client-side so we need to destruct manually.
	 */
	runtimeEnv: {
		DATABASE_URL: process.env.DATABASE_URL,
		REDIS_URL: process.env.REDIS_URL,
		NODE_ENV: process.env.NODE_ENV,

		UPLOADTHING_TOKEN: process.env.UPLOADTHING_TOKEN,

		NEXT_PUBLIC_FLAGS_PROJECT_ID: process.env.NEXT_PUBLIC_FLAGS_PROJECT_ID,
		NEXT_PUBLIC_FLAGS_AGENT_ID: process.env.NEXT_PUBLIC_FLAGS_AGENT_ID,
		NEXT_PUBLIC_FLAGS_ENVIRONMENT: process.env.NEXT_PUBLIC_FLAGS_ENVIRONMENT,

		NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
			process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,

		CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
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

// flags.gg: from the NEXT_PUBLIC_FLAGS_* build args, falling back to Retro Board's production IDs.
// || not ??: an empty build arg still falls back.
export const flagConfig = {
	projectId:
		env.NEXT_PUBLIC_FLAGS_PROJECT_ID || "ce70ace8-9516-4c18-ae62-1f9b1b1d2b33",
	agentId:
		env.NEXT_PUBLIC_FLAGS_AGENT_ID || "281f691b-f932-4d50-8fce-4bdf037fe6cb",
	environmentId:
		env.NEXT_PUBLIC_FLAGS_ENVIRONMENT || "cd76e6a2-95da-4b5d-b129-b6f3b26b2ebf",
};
