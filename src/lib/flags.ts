import { flagConfig } from "~/env";

// flagEnabled checks a flags.gg flag on the server (the React library only works in the browser).
// Anything that goes wrong (flags.gg down, slow, or no such flag) counts as off.
// ponytail: one request per check, uncached; cache for the response's intervalAllowed if traffic grows
export async function flagEnabled(name: string): Promise<boolean> {
	try {
		const response = await fetch("https://api.flags.gg/flags", {
			headers: {
				"x-project-id": flagConfig.projectId,
				"x-agent-id": flagConfig.agentId,
				"x-environment-id": flagConfig.environmentId,
			},
			cache: "no-store",
			signal: AbortSignal.timeout(3000),
		});
		if (!response.ok) return false;
		const data = (await response.json()) as {
			flags?: { enabled?: boolean; details?: { name?: string } }[];
		};
		return (
			data.flags?.some(
				(flag) => flag.details?.name === name && flag.enabled === true,
			) ?? false
		);
	} catch {
		return false;
	}
}
