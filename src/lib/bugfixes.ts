import { error, loadConfigFromEnv, setDefaultConfig } from "bugfixes";

// The SDK's config is module state, and Turbopack can give instrumentation.ts and the routes
// separate copies of the module: configuring it here, where reporting code imports it, means the
// copy that reports always has the BUGFIXES_* credentials (without them it only logs locally).
setDefaultConfig(loadConfigFromEnv());

export { error as reportError };
