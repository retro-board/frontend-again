/** @type {import('jest').Config} */
const config = {
	testEnvironment: "jsdom",
	preset: "ts-jest/presets/default-esm",
	extensionsToTreatAsEsm: [".ts", ".tsx"],
	setupFilesAfterEnv: ["<rootDir>/src/test/setup.ts"],
	testMatch: [
		"<rootDir>/src/**/__tests__/**/*.{ts,tsx}",
		"<rootDir>/src/**/*.{test,spec}.{ts,tsx}",
	],
	moduleNameMapper: {
		"^~/(.*)$": "<rootDir>/src/$1",
		"\\.(css|less|scss|sass)$": "identity-obj-proxy",
	},
	transform: {
		"^.+\\.(ts|tsx)$": [
			"ts-jest",
			{
				useESM: true,
				tsconfig: {
					jsx: "react-jsx",
				},
			},
		],
	},
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

export default config;
