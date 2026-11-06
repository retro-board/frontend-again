import {
	createCipheriv,
	createDecipheriv,
	createHash,
	createHmac,
	randomBytes,
	timingSafeEqual,
} from "node:crypto";

// The sealing key: TRACKLINES_ENCRYPTION_KEY, any long random string (e.g. `openssl rand -base64 32`),
// hashed to 32 bytes. Rotating it means every user reconnects.
function sealingKey(): Buffer {
	const secret = process.env.TRACKLINES_ENCRYPTION_KEY;
	if (!secret) throw new Error("TRACKLINES_ENCRYPTION_KEY is not set");
	return createHash("sha256").update(secret).digest();
}

// seal encrypts a secret with AES-256-GCM, bound to aad (the owner's id) so a sealed value can't be
// moved to another row. Output: base64(iv | tag | ciphertext).
export function seal(plain: string, aad: string): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", sealingKey(), iv);
	cipher.setAAD(Buffer.from(aad));
	const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
	return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

// open reverses seal; it throws if the value, the aad or the key don't match.
export function open(sealed: string, aad: string): string {
	const raw = Buffer.from(sealed, "base64");
	const decipher = createDecipheriv(
		"aes-256-gcm",
		sealingKey(),
		raw.subarray(0, 12),
	);
	decipher.setAAD(Buffer.from(aad));
	decipher.setAuthTag(raw.subarray(12, 28));
	return Buffer.concat([
		decipher.update(raw.subarray(28)),
		decipher.final(),
	]).toString("utf8");
}

// verifySignature checks a TrackLines-Signature header: t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<body>")>,
// sent within the last 5 minutes (so a captured delivery can't be replayed later).
export function verifySignature(
	header: string | null,
	body: string,
	secret: string,
	now = Date.now(),
): boolean {
	const parts = Object.fromEntries(
		(header ?? "").split(",").map((p) => p.trim().split("=", 2)),
	) as Record<string, string | undefined>;
	const t = Number(parts.t);
	if (!parts.v1 || !Number.isFinite(t)) return false;
	if (Math.abs(now / 1000 - t) > 300) return false;
	const want = createHmac("sha256", secret)
		.update(`${parts.t}.${body}`)
		.digest();
	const got = Buffer.from(parts.v1, "hex");
	return got.length === want.length && timingSafeEqual(got, want);
}
