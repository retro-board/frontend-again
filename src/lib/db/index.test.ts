const query = jest.fn();
jest.mock("pg", () => ({ Pool: jest.fn(() => ({ query, on: jest.fn() })) }));
const { Query, projection, identifier } =
	jest.requireActual<typeof import("./index")>("./index");

beforeEach(() => {
	query.mockReset();
	query.mockResolvedValue({ rows: [], rowCount: 0 });
});

test("binds values and rejects SQL identifiers containing SQL", async () => {
	await new Query("boards")
		.select("id")
		.eq("name", "'; DROP TABLE users; --")
		.order("created_at", { ascending: false });
	expect(query).toHaveBeenCalledWith(
		'SELECT t."id" FROM "boards" t WHERE t."name" = $1 ORDER BY t."created_at" DESC',
		["'; DROP TABLE users; --"],
	);
	expect(() => identifier("id; DROP TABLE users")).toThrow(
		"Invalid SQL identifier",
	);
});

test("keeps update filters and SET values in the correct parameter positions", async () => {
	await new Query("cards")
		.update({ content: "changed", position: undefined })
		.eq("id", "card-id")
		.select()
		.single();
	expect(query).toHaveBeenCalledWith(
		'UPDATE "cards" AS t SET "content" = $2 WHERE t."id" = $1 RETURNING t.*',
		["card-id", "changed"],
	);
});

test("uses DEFAULT for missing bulk insert fields and preserves explicit null", async () => {
	await new Query("users").insert([
		{ clerk_id: "one", name: null },
		{ clerk_id: "two" },
	]);
	expect(query).toHaveBeenCalledWith(
		'INSERT INTO "users" AS t ("clerk_id","name") VALUES ($1,$2),($3,DEFAULT)',
		["one", null, "two"],
	);
});

test("supports nested foreign-key projections without multiplying parent rows", () => {
	const sql = projection(
		"columns",
		"*, cards(*, author:users(name), votes:card_votes(id))",
	);
	expect(sql).toContain('r0."column_id" = t.id');
	expect(sql).toContain('r1.id = r0."author_id"');
	expect(sql).toContain('r1."card_id" = r0.id');
	expect(sql).toContain("COALESCE(json_agg(j), '[]'::json)");
	expect(() => projection("users", "secrets(*)")).toThrow("Unknown relation");
});

test("handles no rows, duplicate rows, empty IN lists and head counts", async () => {
	expect((await new Query("users").maybeSingle()).data).toBeNull();
	expect((await new Query("users").single()).error?.code).toBe("PGRST116");
	query.mockResolvedValueOnce({ rows: [{ id: "one" }, { id: "two" }] });
	expect((await new Query("users").maybeSingle()).error?.code).toBe("PGRST116");
	await new Query("cards").delete().in("id", []);
	expect(query).toHaveBeenLastCalledWith(
		'DELETE FROM "cards" AS t WHERE FALSE',
		[],
	);
	query.mockResolvedValueOnce({ rows: [{ id: "one", __count: "7" }] });
	expect(
		await new Query("stories").select("*", { head: true, count: "exact" }),
	).toEqual({ data: null, error: null, count: 7 });
});

test("returns PostgreSQL error codes used by existing conflict handlers", async () => {
	query.mockRejectedValueOnce(
		Object.assign(new Error("Duplicate user"), { code: "23505" }),
	);
	expect((await new Query("users").insert({ clerk_id: "one" })).error).toEqual({
		message: "Duplicate user",
		code: "23505",
	});
});
