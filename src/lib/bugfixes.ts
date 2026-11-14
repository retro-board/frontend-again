import { error, loadConfigFromEnv, setDefaultConfig } from "bugfixes";

// The SDK's config is module state, and Turbopack can give instrumentation.ts and the routes
// separate copies of the module: configuring it here, where reporting code imports it, means the
// copy that reports always has the BUGFIXES_* credentials (without them it only logs locally).
setDefaultConfig(loadConfigFromEnv());

// The db layer's errors are plain { message, code } objects, which the SDK would print as
// "[object Object]": they go as JSON instead.
export const reportError = (...inputs: unknown[]) =>
	error(
		...inputs.map((input) =>
			input && typeof input === "object" && !(input instanceof Error)
				? JSON.stringify(input)
				: input,
		),
	);
