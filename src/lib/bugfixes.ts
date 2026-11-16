import { error, loadConfigFromEnv, setDefaultConfig } from "bugfixes";

// The SDK's config is module state, and Turbopack can give instrumentation.ts and the routes
// separate copies of the module: configuring it here, where reporting code imports it, means the
// copy that reports always has the BUGFIXES_* credentials (without them it only logs locally).
setDefaultConfig(loadConfigFromEnv());

// The db layer's errors are plain { message, code } objects, which the SDK would print as
// "[object Object]": they go as JSON instead. Circular or BigInt values can't be JSON, and this
// runs in catch blocks, so it must not throw (RB-33).
const asText = (input: object) => {
	try {
		return JSON.stringify(input);
	} catch {
		return String(input);
	}
};

export const reportError = (...inputs: unknown[]) =>
	error(
		...inputs.map((input) =>
			input && typeof input === "object" && !(input instanceof Error)
				? asText(input)
				: input,
		),
	);
