import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "~/lib/db";
import { authorizeChannel } from "~/lib/realtime/authorize";

export async function authorizeLegacyPoker(
	sessionId: string,
	facilitator = false,
) {
	const { userId } = await auth();
	const session = (await cookies()).get("anonymous_session_id")?.value;
	if (!userId && !session) {
		return {
			response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
		};
	}
	const identity = await authorizeChannel(`poker:${sessionId}`);
	if (
		!identity ||
		(facilitator && (identity.anonymous || identity.role !== "facilitator"))
	) {
		return {
			response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
		};
	}
	return { identity };
}

export async function requireSessionStory(sessionId: string, storyId: string) {
	const { data, error } = await db
		.from("stories")
		.select("id")
		.eq("id", storyId)
		.eq("session_id", sessionId)
		.maybeSingle();
	if (error) throw new Error("Story lookup failed");
	return data
		? null
		: NextResponse.json({ error: "Story not found" }, { status: 404 });
}
