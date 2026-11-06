import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { reportError } from "~/lib/bugfixes";
import { db } from "~/lib/db";
import { flagEnabled } from "~/lib/flags";
import { TracklinesError, tracklines } from "~/lib/tracklines/client";
import {
	type Connection,
	dbUserId,
	findConnection,
	status,
} from "~/lib/tracklines/connection";
import { open, seal } from "~/lib/tracklines/security";

export const runtime = "nodejs";

async function signedInUser(): Promise<string | null> {
	const { userId } = await auth();
	return userId ? dbUserId(userId) : null;
}

const unauthorized = () =>
	NextResponse.json({ error: "Unauthorized" }, { status: 401 });

// The connection API is closed with the settings page while the "settings" flag (RB-8) is off
const closed = async () =>
	(await flagEnabled("settings"))
		? null
		: NextResponse.json({ error: "Not found" }, { status: 404 });

// removeWebhook takes down the webhook a connection registered; best effort, since the key
// may already be revoked.
async function removeWebhook(row: Connection) {
	if (!row.webhook_id) return;
	try {
		await tracklines(open(row.service_key, row.user_id)).deleteWebhook(
			row.webhook_id,
		);
	} catch {
		// gone already, or the key no longer works: nothing more to do from here
	}
}

// GET /api/tracklines/connection: whether the user is connected (never the key)
export async function GET() {
	const off = await closed();
	if (off) return off;
	const userId = await signedInUser();
	if (!userId) return unauthorized();
	return NextResponse.json(status(await findConnection(userId)));
}

// POST /api/tracklines/connection {key}: check a service key against TrackLin.es, store it sealed,
// and register the sprint.started webhook. A refused webhook still connects.
export async function POST(request: Request) {
	try {
		const off = await closed();
		if (off) return off;
		const userId = await signedInUser();
		if (!userId) return unauthorized();

		const body = await request.json().catch(() => ({}));
		const key = typeof body?.key === "string" ? body.key.trim() : "";
		if (!key.startsWith("tl_s_")) {
			return NextResponse.json(
				{ error: "Paste a TrackLin.es service key (it starts tl_s_)" },
				{ status: 400 },
			);
		}

		const client = tracklines(key);
		try {
			await client.projects();
		} catch (error) {
			if (error instanceof TracklinesError)
				return NextResponse.json(
					{ error: `TrackLin.es didn't accept the key: ${error.message}` },
					{ status: 400 },
				);
			throw error;
		}

		const existing = await findConnection(userId);
		if (existing) await removeWebhook(existing);
		const fields = {
			service_key: seal(key, userId),
			webhook_id: null,
			webhook_secret: null,
			webhook_error: null,
			needs_reconnect: false,
		};
		const { data: row, error: saveError } = existing
			? await db
					.from("tracklines_connections")
					.update(fields)
					.eq("id", existing.id)
					.select()
					.single()
			: await db
					.from("tracklines_connections")
					.insert({ user_id: userId, ...fields })
					.select()
					.single();
		if (saveError || !row) throw new Error(saveError?.message ?? "not saved");

		// ponytail: the request's origin; set APP_URL if the app sits behind a proxy that rewrites Host
		const origin = process.env.APP_URL || new URL(request.url).origin;
		let webhook: Partial<Connection>;
		try {
			const { endpoint, secret } = await client.createWebhook(
				`${origin}/api/tracklines/webhook/${row.id}`,
			);
			webhook = {
				webhook_id: endpoint.id,
				webhook_secret: seal(secret, row.id),
			};
		} catch (error) {
			webhook = {
				webhook_error:
					error instanceof TracklinesError
						? error.message
						: "TrackLin.es couldn't be reached",
			};
		}
		const { data: saved } = await db
			.from("tracklines_connections")
			.update(webhook)
			.eq("id", row.id)
			.select()
			.single();

		return NextResponse.json(status(saved as Connection));
	} catch (error) {
		// error comes from TrackLin.es or the database, never carries the key
		reportError("TrackLin.es connect error:", error);
		return NextResponse.json(
			{ error: "Couldn't connect to TrackLin.es" },
			{ status: 500 },
		);
	}
}

// DELETE /api/tracklines/connection: forget the key and remove the webhook it registered
export async function DELETE() {
	const off = await closed();
	if (off) return off;
	const userId = await signedInUser();
	if (!userId) return unauthorized();
	const row = await findConnection(userId);
	if (row) {
		await removeWebhook(row);
		await db.from("tracklines_connections").delete().eq("id", row.id);
	}
	return NextResponse.json(status(null));
}
