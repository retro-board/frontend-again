import { createHmac } from "node:crypto";
import { open, seal, verifySignature } from "./security";

process.env.TRACKLINES_ENCRYPTION_KEY = "test-key";

describe("seal / open", () => {
	it("round-trips, and the sealed value doesn't contain the secret", () => {
		const sealed = seal("tl_s_secret", "user-1");
		expect(sealed).not.toContain("tl_s_secret");
		expect(open(sealed, "user-1")).toBe("tl_s_secret");
	});

	it("refuses another owner's aad or a tampered value", () => {
		const sealed = seal("tl_s_secret", "user-1");
		expect(() => open(sealed, "user-2")).toThrow();
		const raw = Buffer.from(sealed, "base64");
		raw[raw.length - 1] = (raw[raw.length - 1] ?? 0) ^ 1;
		expect(() => open(raw.toString("base64"), "user-1")).toThrow();
	});
});

describe("verifySignature", () => {
	const body = '{"event":"sprint.started"}';
	const now = 1_800_000_000_000;
	const sign = (secret: string, t: number) =>
		`t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;

	it("accepts TrackLin.es's signature", () => {
		expect(verifySignature(sign("s", now / 1000), body, "s", now)).toBe(true);
	});

	it("refuses another secret, another body, a stale time, or no header", () => {
		expect(verifySignature(sign("other", now / 1000), body, "s", now)).toBe(
			false,
		);
		expect(verifySignature(sign("s", now / 1000), `${body} `, "s", now)).toBe(
			false,
		);
		expect(verifySignature(sign("s", now / 1000 - 301), body, "s", now)).toBe(
			false,
		);
		expect(verifySignature(null, body, "s", now)).toBe(false);
		expect(verifySignature("t=1,v1=zz", body, "s", now)).toBe(false);
	});
});
