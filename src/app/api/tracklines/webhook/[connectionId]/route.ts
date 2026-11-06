import { db } from "~/lib/db";
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
		.select("id, webhook_secret")
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

	// ponytail: sprint.started is only acknowledged; RB-5 makes the sprint's retro from it
	return new Response(null, { status: 204 });
}
