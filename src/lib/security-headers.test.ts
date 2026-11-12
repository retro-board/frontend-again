import { securityHeaders } from "./security-headers";

it("enforces framing protection and standard headers with broader CSP report-only", () => {
	const headers = Object.fromEntries(
		securityHeaders(true).map(({ key, value }) => [key, value]),
	);
	expect(headers["Content-Security-Policy"]).toContain(
		"frame-ancestors 'none'",
	);
	expect(headers["X-Frame-Options"]).toBe("DENY");
	expect(headers["X-Content-Type-Options"]).toBe("nosniff");
	expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
	expect(headers["Strict-Transport-Security"]).toBe("max-age=31536000");
	expect(headers["Content-Security-Policy-Report-Only"]).toContain(
		"https://api.flags.gg",
	);
	expect(headers["Content-Security-Policy-Report-Only"]).not.toContain(
		"unsafe-eval",
	);
});
it("includes the configured Clerk origin and supports local development", () => {
	const key = `pk_test_${Buffer.from("clerk.example.com$").toString("base64")}`;
	const headers = Object.fromEntries(
		securityHeaders(false, key).map(({ key, value }) => [key, value]),
	);
	expect(headers["Content-Security-Policy-Report-Only"]).toContain(
		"https://clerk.example.com",
	);
	expect(headers["Content-Security-Policy-Report-Only"]).toContain(
		"https://*.protect.clerk.com:*",
	);
	expect(headers["Content-Security-Policy-Report-Only"]).toContain(
		"unsafe-eval",
	);
	expect(headers["Strict-Transport-Security"]).toBeUndefined();
});
