import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { Pool } from "pg";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
	await client.query("SELECT pg_advisory_lock(78234612)");
	await client.query(
		"CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
	);
	const directory = new URL("../db/migrations/", import.meta.url);
	for (const name of (await readdir(directory))
		.filter((name) => name.endsWith(".sql"))
		.sort()) {
		const sql = await readFile(new URL(name, directory), "utf8");
		const checksum = createHash("sha256").update(sql).digest("hex");
		const applied = await client.query(
			"SELECT checksum FROM schema_migrations WHERE name = $1",
			[name],
		);
		if (applied.rows.length) {
			if (applied.rows[0].checksum !== checksum)
				throw new Error(`Applied migration changed: ${name}`);
			continue;
		}
		await client.query("BEGIN");
		try {
			await client.query(sql);
			await client.query(
				"INSERT INTO schema_migrations(name, checksum) VALUES ($1, $2)",
				[name, checksum],
			);
			await client.query("COMMIT");
			console.log(`Applied ${name}`);
		} catch (error) {
			await client.query("ROLLBACK");
			throw error;
		}
	}
} finally {
	await client.query("SELECT pg_advisory_unlock(78234612)");
	client.release();
	await pool.end();
}
