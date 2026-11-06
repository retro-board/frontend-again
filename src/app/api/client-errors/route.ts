import { allowReport, cleanReport, reportServer } from "~/lib/report";

export const runtime = "nodejs";

// POST /api/client-errors: the browser's errors, reported to Bugfixes from here so its
// credentials stay on the server. Rate limited before the body is read; always 204 so a page
// never retries or learns more.
export async function POST(request: Request): Promise<Response> {
	const address =
		(request.headers.get("x-forwarded-for") ?? "").split(",").pop()?.trim() ||
		"unknown";
	if (!allowReport(address)) return new Response(null, { status: 204 });
	if (Number(request.headers.get("content-length") ?? 0) > 16_384)
		return new Response("report too large", { status: 413 });
	// ponytail: content-length check only; a chunked body is read whole, the rate limit caps the damage
	let body: unknown = null;
	try {
		body = JSON.parse((await request.text()).slice(0, 16_384));
	} catch {
		// not JSON: nothing to report
	}
	const report = cleanReport(body);
	if (report)
		await reportServer(
			`browser ${report.kind}: ${report.message}`,
			`${report.path}\n${report.stack}`,
		);
	return new Response(null, { status: 204 });
}
