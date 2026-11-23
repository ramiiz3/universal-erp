import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const connectionString = process.env.MIGRATIONS_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Set MIGRATIONS_DATABASE_URL to the PostgreSQL owner connection string.");
  process.exit(1);
}
const pool = new Pool({
  connectionString,
  max: 1,
  ...(process.env.PGSSLMODE === "require"
    ? { ssl: { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED !== "false" } }
    : {}),
});
const directory = fileURLToPath(new URL("./migrations/", import.meta.url));

try {
  await pool.query("create schema if not exists erp_private");
  await pool.query(
    "create table if not exists erp_private.schema_migrations (" +
    "version text primary key, applied_at timestamptz not null default now())",
  );
  const files = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
  for (const file of files) {
    const existing = await pool.query("select 1 from erp_private.schema_migrations where version=$1", [file]);
    if (existing.rowCount) {
      console.log("Already applied: " + file);
      continue;
    }
    const sql = await readFile(join(directory, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into erp_private.schema_migrations(version) values($1)", [file]);
      await client.query("commit");
      console.log("Applied: " + file);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
} catch (error) {
  console.error("Database migration failed:", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
