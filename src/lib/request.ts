// Behind Railway's proxy, request.url is the app's internal address (http://localhost:…), not the
// one the browser used. The proxy passes the public one in the Host / X-Forwarded-* headers.
const first = (value: string | null) => value?.split(",")[0]?.trim() || null;

// publicHost: the host the browser asked for, e.g. retro-board.net
export function publicHost(request: Request): string {
	return (
		first(request.headers.get("x-forwarded-host")) ??
		first(request.headers.get("host")) ??
		new URL(request.url).host
	);
}

// publicOrigin: the browser's origin for this request, e.g. https://retro-board.net
export function publicOrigin(request: Request): string {
	const proto =
		first(request.headers.get("x-forwarded-proto")) ??
		new URL(request.url).protocol.replace(":", "");
	return `${proto}://${publicHost(request)}`;
}

// sameOrigin: false for a cross-site request (its Origin names another host); true without an Origin
export function sameOrigin(request: Request): boolean {
	const origin = request.headers.get("origin");
	if (!origin) return true;
	try {
		return new URL(origin).host === publicHost(request);
	} catch {
		return false;
	}
}
