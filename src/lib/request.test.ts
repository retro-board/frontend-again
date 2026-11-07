import { publicOrigin, sameOrigin } from "./request";

const req = (url: string, headers: Record<string, string>) =>
	({ url, headers: new Headers(headers) }) as unknown as Request;

describe("public origin behind the proxy", () => {
	const proxied = {
		host: "retro-board.net",
		"x-forwarded-proto": "https",
	};

	it("uses the forwarded host and protocol, not the internal request.url", () => {
		expect(publicOrigin(req("http://localhost:8080/x", proxied))).toBe(
			"https://retro-board.net",
		);
		expect(
			publicOrigin(
				req("http://localhost:8080/x", {
					"x-forwarded-host": "retro-board.net, internal",
					"x-forwarded-proto": "https,http",
				}),
			),
		).toBe("https://retro-board.net");
		expect(publicOrigin(req("https://retro.test/x", {}))).toBe(
			"https://retro.test",
		);
	});

	it("allows the site's own origin and refuses another site", () => {
		const own = { ...proxied, origin: "https://retro-board.net" };
		expect(sameOrigin(req("http://localhost:8080/x", own))).toBe(true);
		expect(
			sameOrigin(
				req("http://localhost:8080/x", {
					...proxied,
					origin: "https://evil.example",
				}),
			),
		).toBe(false);
		expect(sameOrigin(req("http://localhost:8080/x", proxied))).toBe(true);
		expect(
			sameOrigin(
				req("http://localhost:8080/x", { ...proxied, origin: "null" }),
			),
		).toBe(false);
	});
});
