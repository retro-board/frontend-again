/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "~/env";
import type { NextConfig } from "next";

/** @type {import("next").NextConfig} */
const config: NextConfig = {
	eslint: {
		// Allow production builds to complete even with ESLint errors
		ignoreDuringBuilds: true,
	},
};

export default config;
