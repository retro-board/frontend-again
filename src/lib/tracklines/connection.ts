import { db } from "~/lib/db";
import { type TracklinesClient, TracklinesError, tracklines } from "./client";
import { open } from "./security";

export interface Connection {
	id: string;
	user_id: string;
	service_key: string; // sealed, aad = user_id
	webhook_id: string | null;
	webhook_secret: string | null; // sealed, aad = id
	webhook_error: string | null;
	needs_reconnect: boolean;
}

// dbUserId: the retro-board user id for a Clerk user, null if they've never synced.
export async function dbUserId(clerkId: string): Promise<string | null> {
	const { data } = await db
		.from("users")
		.select("id")
		.eq("clerk_id", clerkId)
		.maybeSingle();
	return data?.id ?? null;
}

export async function findConnection(
	userId: string,
): Promise<Connection | null> {
	const { data } = await db
		.from("tracklines_connections")
		.select("*")
		.eq("user_id", userId)
		.maybeSingle();
	return (data as Connection | null) ?? null;
}

// status is what settings show; never the key or the secret.
export function status(row: Connection | null) {
	return {
		connected: !!row,
		needs_reconnect: row?.needs_reconnect ?? false,
		webhook: !!row?.webhook_id,
		webhook_error: row?.webhook_error ?? null,
	};
}

// clientFor: the user's TrackLin.es client, null when they aren't connected. A 401 or 403 from
// TrackLin.es marks the connection so settings ask them to reconnect.
export async function clientFor(
	userId: string,
): Promise<TracklinesClient | null> {
	const row = await findConnection(userId);
	if (!row) return null;
	const client = tracklines(open(row.service_key, row.user_id));
	return Object.fromEntries(
		Object.entries(client).map(([name, call]) => [
			name,
			async (...args: unknown[]) => {
				try {
					return await (call as (...a: unknown[]) => Promise<unknown>)(...args);
				} catch (error) {
					if (
						error instanceof TracklinesError &&
						(error.status === 401 || error.status === 403)
					)
						await db
							.from("tracklines_connections")
							.update({ needs_reconnect: true })
							.eq("id", row.id);
					throw error;
				}
			},
		]),
	) as TracklinesClient;
}
