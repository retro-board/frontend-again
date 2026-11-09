import nextJest from "next/jest.js";

// next/jest transpiles with SWC; ts-jest needs the TS compiler API, which TypeScript 7 dropped
// next/jest loads next.config.ts, which validates env; tests mock ~/env
process.env.SKIP_ENV_VALIDATION ??= "1";
const createJestConfig = nextJest({ dir: "./" });

/** @type {import('jest').Config} */
const config = {
	testEnvironment: "jsdom",
	modulePathIgnorePatterns: ["<rootDir>/.next/"],
	setupFilesAfterEnv: ["<rootDir>/src/test/setup.ts"],
	testMatch: [
		"<rootDir>/src/**/__tests__/**/*.{ts,tsx}",
		"<rootDir>/src/**/*.{test,spec}.{ts,tsx}",
	],
	moduleNameMapper: {
		"^~/(.*)$": "<rootDir>/src/$1",
		"^bugfixes$": "<rootDir>/src/test/bugfixes.ts",
		"\\.(css|less|scss|sass)$": "identity-obj-proxy",
	},
	transformIgnorePatterns: ["node_modules/(?!(@clerk|nanoid)/)"],
	collectCoverageFrom: [
		"src/**/*.{ts,tsx}",
		"!src/**/*.d.ts",
		"!src/test/**/*",
		"!src/app/layout.tsx",
		"!src/env.js",
	],
	coverageThreshold: {
		global: {
			branches: 25,
			functions: 30,
			lines: 40,
			statements: 40,
		},
	},
};

export default createJestConfig(config);
