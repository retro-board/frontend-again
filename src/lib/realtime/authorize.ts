import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { db } from "~/lib/db";

export async function authorizeChannel(channel: string) {
	const match = /^(board|poker):([0-9a-f-]{36})$/i.exec(channel);
	if (!match) return null;
	const kind = match[1];
	const id = match[2];
	const { userId } = await auth();
	const session = (await cookies()).get("anonymous_session_id")?.value;
	const identity = userId
		? await db
				.from("users")
				.select("id, clerk_id, name")
				.eq("clerk_id", userId)
				.maybeSingle()
		: session
			? await db
					.from("anonymous_users")
					.select("id, display_name")
					.eq("session_id", session)
					.maybeSingle()
			: null;
	if (identity?.error) throw new Error("Identity lookup failed");
	if (!identity?.data) return null;
	const user = identity.data;
	const anonymous = !userId;
	const table = kind === "board" ? "boards" : "poker_sessions";
	const resource = await db
		.from(table)
		.select("owner_id")
		.eq("id", id)
		.maybeSingle();
	if (resource.error) throw new Error("Resource lookup failed");
	if (!resource.data) return null;
	const owner = !anonymous && resource.data.owner_id === user.id;
	const prefix = kind === "board" ? "board" : "poker";
	const membership = await db
		.from(`${prefix}_${anonymous ? "anonymous_" : ""}participants`)
		.select("*")
		.eq(kind === "board" ? "board_id" : "session_id", id)
		.eq(anonymous ? "anonymous_user_id" : "user_id", user.id)
		.maybeSingle();
	if (membership.error) throw new Error("Membership lookup failed");
	if (!owner && !membership.data) return null;
	return {
		kind,
		id,
		user,
		anonymous,
		role: owner
			? kind === "board"
				? "owner"
				: "facilitator"
			: (membership.data?.role ?? "voter"),
	};
}
