/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "~/env";
import type { NextConfig } from "next";
import { securityHeaders } from "~/lib/security-headers";

/** @type {import("next").NextConfig} */
const config: NextConfig = {
	output: "standalone",
	async headers() {
		return [
			{
				source: "/(.*)",
				headers: securityHeaders(
					process.env.NODE_ENV === "production",
					process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
				),
			},
		];
	},
	serverExternalPackages: ["pg", "ioredis"],
};

export default config;
