// Broader restrictions start in report-only mode so deployment-specific integrations can be checked.
export function securityHeaders(production: boolean, publishableKey?: string) {
	let clerkOrigin = "";
	if (publishableKey) {
		const host = Buffer.from(
			publishableKey.replace(/^pk_(test|live)_/, ""),
			"base64",
		)
			.toString()
			.replace(/\$$/, "");
		if (/^[a-z0-9.-]+$/i.test(host)) clerkOrigin = `https://${host}`;
	}
	const clerk = [
		clerkOrigin,
		"https://*.clerk.accounts.dev",
		"https://*.clerk.com",
	]
		.filter(Boolean)
		.join(" ");
	const reportOnly = [
		"default-src 'self'",
		`script-src 'self' 'unsafe-inline'${production ? "" : " 'unsafe-eval'"} ${clerk} https://challenges.cloudflare.com https://*.protect.clerk.com`,
		"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
		"img-src 'self' data: blob: https:",
		"font-src 'self' data: https://fonts.gstatic.com",
		`connect-src 'self' ${clerk} https://*.protect.clerk.com:* https://clerk-telemetry.com https://*.clerk-telemetry.com https://api.flags.gg https://*.flags.gg https://*.uploadthing.com https://*.ufs.sh https://*.utfs.io${production ? "" : " ws: http://localhost:*"}`,
		`frame-src 'self' ${clerk} https://challenges.cloudflare.com https://*.protect.clerk.com`,
		"worker-src 'self' blob:",
		"object-src 'none'",
		"base-uri 'self'",
		"form-action 'self'",
		"frame-ancestors 'none'",
	].join("; ");
	return [
		{
			key: "Content-Security-Policy",
			value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
		},
		{ key: "Content-Security-Policy-Report-Only", value: reportOnly },
		{ key: "X-Frame-Options", value: "DENY" },
		{ key: "X-Content-Type-Options", value: "nosniff" },
		{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
		...(production
			? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }]
			: []),
	];
}
