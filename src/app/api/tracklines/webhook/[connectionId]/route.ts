import { db } from "~/lib/db";
import { flagEnabled } from "~/lib/flags";
import type { Connection } from "~/lib/tracklines/connection";
import { createSprintRetro, sprintEvent } from "~/lib/tracklines/retros";
import { open, verifySignature } from "~/lib/tracklines/security";

export const runtime = "nodejs";

// POST /api/tracklines/webhook/{connectionId}: TrackLin.es events for one connection. Each
// connection's webhook has its own secret, so a good signature also proves the event came from
// the TrackLin.es org that connection belongs to; anything else is refused.
export async function POST(
	request: Request,
	{ params }: { params: Promise<{ connectionId: string }> },
) {
	const { connectionId } = await params;
	const body = await request.text();
	const { data: row } = await db
		.from("tracklines_connections")
		.select("*")
		.eq("id", connectionId)
		.maybeSingle();

	let signed = false;
	if (row?.webhook_secret) {
		try {
			signed = verifySignature(
				request.headers.get("tracklines-signature"),
				body,
				open(row.webhook_secret, row.id),
			);
		} catch {
			signed = false;
		}
	}
	if (!signed) return new Response("bad signature", { status: 401 });

	if (!(await flagEnabled("rb-5"))) return new Response(null, { status: 204 });
	let event: { event?: string } | null = null;
	try {
		event = JSON.parse(body);
	} catch {
		return new Response("Invalid JSON", { status: 400 });
	}
	if (event?.event !== "sprint.started")
		return new Response(null, { status: 204 });
	const parsed = sprintEvent.safeParse(event);
	if (!parsed.success)
		return new Response("Invalid sprint event", { status: 400 });
	try {
		await createSprintRetro(row as Connection, parsed.data);
	} catch {
		return new Response("Could not create sprint retro; retry delivery", {
			status: 503,
		});
	}
	return new Response(null, { status: 204 });
}
