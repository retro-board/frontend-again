import { reportServer } from "~/lib/report";

// Next.js calls register once when the server starts. The Bugfixes SDK reads
// BUGFIXES_AGENT_KEY / BUGFIXES_AGENT_SECRET / BUGFIXES_LOCAL_ONLY from the environment;
// without them it only logs locally.
export async function register() {
	const { loadConfigFromEnv, setDefaultConfig } = await import("bugfixes");
	setDefaultConfig(loadConfigFromEnv());
}

// onRequestError: a page, route or proxy that crashed on the server goes to Bugfixes.
export async function onRequestError(
	err: unknown,
	request: { path: string; method: string },
	context: { routePath?: string; routeType?: string },
) {
	const e = err instanceof Error ? err : new Error(String(err));
	const path = request.path.split(/[?#]/)[0]; // never the query
	await reportServer(
		`server ${context.routeType ?? "request"} error: ${e.message}`,
		`${request.method} ${path} (${context.routePath ?? ""})\n${e.stack ?? ""}`,
	);
}
