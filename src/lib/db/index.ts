import { Pool, type QueryResultRow } from "pg";

let pool: Pool | undefined;
export function getPool() {
	if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
	if (!pool) {
		pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
		pool.on("error", (error) => console.error("PostgreSQL pool error", error));
	}
	return pool;
}

export function identifier(value: string) {
	if (!/^[a-z_][a-z_0-9]*$/i.test(value))
		throw new Error("Invalid SQL identifier");
	return `"${value}"`;
}

// Only these schema relationships can be expanded by the server's queries.
const foreignKeys: Record<string, Record<string, string>> = {
	boards: { users: "owner_id" },
	columns: { boards: "board_id" },
	cards: {
		columns: "column_id",
		users: "author_id",
		anonymous_users: "anonymous_author_id",
	},
	card_votes: {
		cards: "card_id",
		users: "user_id",
		anonymous_users: "anonymous_user_id",
	},
	board_participants: { boards: "board_id", users: "user_id" },
	board_anonymous_participants: {
		boards: "board_id",
		anonymous_users: "anonymous_user_id",
	},
	poker_sessions: { users: "owner_id" },
	stories: { poker_sessions: "session_id" },
	poker_votes: {
		stories: "story_id",
		users: "user_id",
		anonymous_users: "anonymous_user_id",
	},
	poker_participants: { poker_sessions: "session_id", users: "user_id" },
	poker_anonymous_participants: {
		poker_sessions: "session_id",
		anonymous_users: "anonymous_user_id",
	},
};

function splitFields(value: string) {
	const fields: string[] = [];
	let depth = 0;
	let start = 0;
	for (let i = 0; i < value.length; i++) {
		if (value[i] === "(") depth++;
		if (value[i] === ")") depth--;
		if (value[i] === "," && depth === 0) {
			fields.push(value.slice(start, i).trim());
			start = i + 1;
		}
	}
	fields.push(value.slice(start).trim());
	return fields.filter(Boolean);
}

// Compile nested projections to correlated JSON subqueries, in one database round trip.
export function projection(
	table: string,
	fields: string,
	alias = "t",
	depth = 0,
): string {
	return splitFields(fields)
		.map((field) => {
			if (field === "*") return `${alias}.*`;
			const nested = /^(?:(\w+):)?(\w+)(?:![\w]+)?\(([\s\S]*)\)$/.exec(field);
			if (!nested) return `${alias}.${identifier(field)}`;
			const [, label, target, children] = nested;
			if (!target || !children) throw new Error("Invalid relation");
			const child = `r${depth}`;
			const forward = foreignKeys[table]?.[target];
			const reverse = foreignKeys[target]?.[table];
			if (!forward && !reverse)
				throw new Error(`Unknown relation ${table}.${target}`);
			const condition = forward
				? `${child}.id = ${alias}.${identifier(forward)}`
				: `${child}.${identifier(reverse ?? "")} = ${alias}.id`;
			const query = `SELECT ${projection(target, children, child, depth + 1)} FROM ${identifier(target)} ${child} WHERE ${condition}`;
			const json = forward
				? `(SELECT row_to_json(j) FROM (${query}) j)`
				: `(SELECT COALESCE(json_agg(j), '[]'::json) FROM (${query}) j)`;
			return `${json} AS ${identifier(label || target)}`;
		})
		.join(", ");
}

type Result = {
	data: QueryResultRow[] | null;
	error: {
		message: string;
		code?: string;
		details?: string;
		hint?: string;
	} | null;
	count: number | null;
};

/** Server-only query builder; values are always bound as PostgreSQL parameters. */
export class Query implements PromiseLike<Result> {
	private operation = "select";
	private fields = "*";
	private values: unknown[] = [];
	private filters: string[] = [];
	private ordering: string[] = [];
	private maximum?: number;
	private rows: Record<string, unknown>[] = [];
	private returning = false;
	private head = false;
	private counted = false;
	constructor(private table: string) {
		identifier(table);
	}
	private bind(value: unknown) {
		this.values.push(value);
		return `$${this.values.length}`;
	}
	select(fields = "*", options?: { count?: string; head?: boolean }) {
		this.fields = fields;
		this.returning = true;
		this.head = !!options?.head;
		this.counted = !!options?.count;
		return this;
	}
	insert(rows: Record<string, unknown> | Record<string, unknown>[]) {
		this.operation = "insert";
		this.rows = Array.isArray(rows) ? rows : [rows];
		return this;
	}
	update(row: Record<string, unknown>) {
		this.operation = "update";
		this.rows = [row];
		return this;
	}
	delete() {
		this.operation = "delete";
		return this;
	}
	eq(column: string, value: unknown) {
		this.filters.push(`t.${identifier(column)} = ${this.bind(value)}`);
		return this;
	}
	neq(column: string, value: unknown) {
		this.filters.push(`t.${identifier(column)} <> ${this.bind(value)}`);
		return this;
	}
	in(column: string, values: unknown[]) {
		this.filters.push(
			values.length
				? `t.${identifier(column)} IN (${values.map((v) => this.bind(v)).join(",")})`
				: "FALSE",
		);
		return this;
	}
	or(expression: string) {
		const clauses = expression.split(",").map((part) => {
			const match = /^(\w+)\.eq\.(.+)$/.exec(part);
			if (!match?.[1]) throw new Error("Unsupported filter");
			return `t.${identifier(match[1])} = ${this.bind(match[2])}`;
		});
		this.filters.push(`(${clauses.join(" OR ")})`);
		return this;
	}
	order(column: string, options?: { ascending?: boolean }) {
		this.ordering.push(
			`t.${identifier(column)} ${options?.ascending === false ? "DESC" : "ASC"}`,
		);
		return this;
	}
	limit(maximum: number) {
		if (!Number.isSafeInteger(maximum) || maximum < 0)
			throw new Error("Invalid limit");
		this.maximum = maximum;
		return this;
	}
	async single() {
		return this.one(false);
	}
	async maybeSingle() {
		return this.one(true);
	}
	private async one(
		optional: boolean,
	): Promise<{ data: QueryResultRow; error: Result["error"] }> {
		const result = await this.execute();
		if (
			!result.error &&
			result.data?.length !== 1 &&
			!(optional && result.data?.length === 0)
		) {
			return {
				data: null as unknown as QueryResultRow,
				error: { message: "Expected one row", code: "PGRST116" },
			};
		}
		return {
			data: (result.data?.[0] ?? null) as unknown as QueryResultRow,
			error: result.error,
		};
	}
	async execute(): Promise<Result> {
		try {
			const where = this.filters.length
				? ` WHERE ${this.filters.join(" AND ")}`
				: "";
			let sql: string;
			if (this.operation === "select") {
				sql = `SELECT ${projection(this.table, this.fields)}${this.counted ? ", count(*) OVER() AS __count" : ""} FROM ${identifier(this.table)} t${where}`;
				if (this.ordering.length) sql += ` ORDER BY ${this.ordering.join(",")}`;
				if (this.maximum !== undefined) sql += ` LIMIT ${this.maximum}`;
			} else {
				const keys = [
					...new Set(
						this.rows.flatMap((row) =>
							Object.keys(row).filter((key) => row[key] !== undefined),
						),
					),
				];
				if (this.operation === "insert") {
					if (!this.rows.length) return { data: [], error: null, count: 0 };
					sql = `INSERT INTO ${identifier(this.table)} AS t (${keys.map(identifier).join(",")}) VALUES ${this.rows.map((row) => `(${keys.map((key) => (row[key] === undefined ? "DEFAULT" : this.bind(row[key]))).join(",")})`).join(",")}`;
				} else if (this.operation === "update") {
					if (!keys.length) throw new Error("No fields to update");
					sql = `UPDATE ${identifier(this.table)} AS t SET ${keys.map((key) => `${identifier(key)} = ${this.bind(this.rows[0]?.[key])}`).join(",")}${where}`;
				} else sql = `DELETE FROM ${identifier(this.table)} AS t${where}`;
				if (this.returning)
					sql += ` RETURNING ${projection(this.table, this.fields)}`;
			}
			const result = await getPool().query(sql, this.values);
			const count = this.counted ? Number(result.rows[0]?.__count ?? 0) : null;
			for (const row of result.rows) delete row.__count;
			return { data: this.head ? null : result.rows, error: null, count };
		} catch (error) {
			return {
				data: null,
				error: {
					message: error instanceof Error ? error.message : String(error),
					code: (error as { code?: string }).code,
				},
				count: null,
			};
		}
	}
	// biome-ignore lint/suspicious/noThenProperty: Queries intentionally implement PromiseLike for server routes.
	then<TResult1 = Result, TResult2 = never>(
		onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
		onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
	): PromiseLike<TResult1 | TResult2> {
		return this.execute().then(onfulfilled, onrejected);
	}
}
export const db = { from: (table: string) => new Query(table) };
