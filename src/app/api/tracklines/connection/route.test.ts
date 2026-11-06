import { createHmac } from "node:crypto";
import { auth } from "@clerk/nextjs/server";
import { clientFor } from "~/lib/tracklines/connection";
import { open } from "~/lib/tracklines/security";
import { POST as webhook } from "../webhook/[connectionId]/route";
import { DELETE, GET, POST } from "./route";

process.env.TRACKLINES_ENCRYPTION_KEY = "test-key";

jest.mock("@clerk/nextjs/server", () => ({ auth: jest.fn() }));
let mockSettingsFlag = true;
jest.mock("~/lib/flags", () => ({
	flagEnabled: async (name: string) => name === "settings" && mockSettingsFlag,
}));
jest.mock("next/server", () => ({
	NextResponse: { json: jest.fn((data, init) => ({ data, init })) },
}));

// An in-memory tracklines_connections table behind the db query builder's shape
const mockTable: Record<string, unknown>[] = [];
jest.mock("~/lib/db", () => ({
	db: {
		from: (table: string) => {
			let op = "select";
			let patch: Record<string, unknown> = {};
			const filters: [string, unknown][] = [];
			const run = (one: boolean) => {
				if (table === "users")
					return Promise.resolve({ data: { id: "user-1" }, error: null });
				const match = (r: Record<string, unknown>) =>
					filters.every(([c, v]) => r[c] === v);
				let out: Record<string, unknown>[];
				if (op === "insert") {
					const row = { id: "conn-1", ...patch };
					mockTable.push(row);
					out = [row];
				} else if (op === "update") {
					out = mockTable.filter(match);
					for (const r of out) Object.assign(r, patch);
				} else if (op === "delete") {
					const keep = mockTable.filter((r) => !match(r));
					mockTable.splice(0, mockTable.length, ...keep);
					out = [];
				} else out = mockTable.filter(match);
				return Promise.resolve({
					data: one ? (out[0] ?? null) : out,
					error: null,
				});
			};
			const q = {
				select: () => q,
				eq: (c: string, v: unknown) => {
					filters.push([c, v]);
					return q;
				},
				insert: (row: Record<string, unknown>) => {
					op = "insert";
					patch = row;
					return q;
				},
				update: (row: Record<string, unknown>) => {
					op = "update";
					patch = row;
					return q;
				},
				delete: () => {
					op = "delete";
					return q;
				},
				single: () => run(true),
				maybeSingle: () => run(true),
				// biome-ignore lint/suspicious/noThenProperty: mirrors the real query builder
				then: (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) =>
					run(false).then(ok, bad),
			};
			return q;
		},
	},
}));

const KEY = "tl_s_good_key";
const SECRET = "whsec_signing_secret";
type Call = { method: string; path: string; auth: string };
let calls: Call[];

// A fake TrackLin.es: projects answers for KEY only; the webhook can be refused
function mockTracklines({ webhook = "ok" }: { webhook?: "ok" | "refused" }) {
	calls = [];
	(global.fetch as jest.Mock).mockImplementation(
		async (url: string, init: RequestInit) => {
			const path = new URL(url).pathname;
			const authz =
				(init.headers as Record<string, string>).Authorization ?? "";
			calls.push({ method: init.method ?? "GET", path, auth: authz });
			if (authz !== `Bearer ${KEY}`)
				return new Response("invalid API key", { status: 401 });
			if (path === "/api/projects") return new Response("[]", { status: 200 });
			if (path === "/api/org/webhooks")
				return webhook === "ok"
					? new Response(
							JSON.stringify({ endpoint: { id: "wh-1" }, secret: SECRET }),
							{ status: 201 },
						)
					: new Response(
							JSON.stringify({ error: "Webhooks need a paid plan" }),
							{ status: 403 },
						);
			if (path === "/api/org/webhooks/wh-1")
				return new Response(null, { status: 204 });
			return new Response("not found", { status: 404 });
		},
	);
}

const connect = (key: string) =>
	POST(
		new Request("https://retro.test/api/tracklines/connection", {
			method: "POST",
			body: JSON.stringify({ key }),
		}),
	) as unknown as Promise<{
		data: Record<string, unknown>;
		init?: ResponseInit;
	}>;

describe("TrackLin.es connection (RB-3)", () => {
	beforeEach(() => {
		mockTable.splice(0);
		(auth as unknown as jest.Mock).mockResolvedValue({ userId: "clerk-1" });
		jest.spyOn(console, "error").mockImplementation(() => {});
		mockSettingsFlag = true;
	});

	it("is closed (404) while the settings flag is off", async () => {
		mockTracklines({});
		mockSettingsFlag = false;
		expect((await connect(KEY)).init).toEqual({ status: 404 });
		expect(((await GET()) as unknown as { init: ResponseInit }).init).toEqual({
			status: 404,
		});
		expect(
			((await DELETE()) as unknown as { init: ResponseInit }).init,
		).toEqual({ status: 404 });
		expect(calls).toHaveLength(0);
		expect(mockTable).toHaveLength(0);
	});

	it("connects with a good key and registers the sprint webhook", async () => {
		mockTracklines({});
		const response = await connect(KEY);
		expect(response.data).toEqual({
			connected: true,
			needs_reconnect: false,
			webhook: true,
			webhook_error: null,
		});
		expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
			"GET /api/projects",
			"POST /api/org/webhooks",
		]);
		const row = mockTable[0] as Record<string, string> & {
			service_key: string;
			webhook_secret: string;
		};
		expect(row.service_key).not.toContain(KEY);
		expect(open(row.service_key, "user-1")).toBe(KEY);
		expect(open(row.webhook_secret, "conn-1")).toBe(SECRET);
	});

	it("refuses a bad key and stores nothing", async () => {
		mockTracklines({});
		const response = await connect("tl_s_bad_key");
		expect(response.init).toEqual({ status: 400 });
		expect(response.data.error).toContain("invalid API key");
		expect(mockTable).toHaveLength(0);
		expect((await connect("not-a-service-key")).init).toEqual({
			status: 400,
		});
	});

	it("still connects when TrackLin.es refuses the webhook", async () => {
		mockTracklines({ webhook: "refused" });
		const response = await connect(KEY);
		expect(response.data).toEqual({
			connected: true,
			needs_reconnect: false,
			webhook: false,
			webhook_error: "Webhooks need a paid plan",
		});
	});

	it("removes the webhook on disconnect", async () => {
		mockTracklines({});
		await connect(KEY);
		calls = [];
		const response = (await DELETE()) as unknown as { data: object };
		expect(response.data).toMatchObject({ connected: false });
		expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
			"DELETE /api/org/webhooks/wh-1",
		]);
		expect(mockTable).toHaveLength(0);
	});

	it("never returns or logs the key or the secret", async () => {
		mockTracklines({});
		const responses = [await connect(KEY), await GET()];
		const shown = JSON.stringify(responses);
		const logged = JSON.stringify((console.error as jest.Mock).mock.calls);
		for (const secret of [KEY, SECRET]) {
			expect(shown).not.toContain(secret);
			expect(logged).not.toContain(secret);
		}
	});

	it("asks to reconnect once TrackLin.es stops accepting the key", async () => {
		mockTracklines({});
		await connect(KEY);
		(global.fetch as jest.Mock).mockResolvedValue(
			new Response("API key revoked", { status: 401 }),
		);
		const client = await clientFor("user-1");
		await expect(client?.projects()).rejects.toThrow("API key revoked");
		expect(((await GET()) as unknown as { data: object }).data).toMatchObject({
			connected: true,
			needs_reconnect: true,
		});
	});

	describe("webhook receiver", () => {
		const deliver = (signature: string | null, id = "conn-1") => {
			const body = '{"event":"sprint.started","data":{}}';
			return webhook(
				new Request(`https://retro.test/api/tracklines/webhook/${id}`, {
					method: "POST",
					body,
					headers: signature ? { "TrackLines-Signature": signature } : {},
				}),
				{ params: Promise.resolve({ connectionId: id }) },
			);
		};
		const sign = (secret: string) => {
			const t = Math.floor(Date.now() / 1000);
			const body = '{"event":"sprint.started","data":{}}';
			return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;
		};

		it("accepts a delivery signed with the connection's secret", async () => {
			mockTracklines({});
			await connect(KEY);
			expect((await deliver(sign(SECRET))).status).toBe(204);
		});

		it("refuses a bad signature, no signature, or an unknown connection", async () => {
			mockTracklines({});
			await connect(KEY);
			expect((await deliver(sign("someone-else"))).status).toBe(401);
			expect((await deliver(null)).status).toBe(401);
			expect((await deliver(sign(SECRET), "conn-unknown")).status).toBe(401);
		});
	});
});
