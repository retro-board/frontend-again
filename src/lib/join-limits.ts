import { createHash } from "node:crypto";
import { getRedis } from "~/lib/realtime/server";

const script = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], 60) end
return count
`;
export async function allowJoinRequest(
	request: Request,
	kind: "create" | "join",
) {
	const address =
		(request.headers.get("x-forwarded-for") ?? "").split(",").pop()?.trim() ||
		"unknown";
	const key = `retro:limits:${kind}:${createHash("sha256").update(address).digest("hex")}`;
	const count = Number(await getRedis().eval(script, 1, key));
	return count <= (kind === "create" ? 10 : 30);
}
export function anonymousDisplayName(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const name = value.trim();
	return name.length >= 1 && name.length <= 50 ? name : null;
}
