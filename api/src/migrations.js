import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPool, isDbConfigured, query } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "..", "migrations");

async function ensureMigrationsTable() {
  await query(`
    create table if not exists schema_migrations (
      id text primary key,
      applied_at timestamptz not null default now()
    )
  `);
}

async function listMigrationFiles() {
  const entries = await fs.readdir(migrationsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();
}

export async function runMigrations() {
  if (!isDbConfigured()) {
    return;
  }

  await ensureMigrationsTable();

  const appliedResult = await query("select id from schema_migrations");
  const applied = new Set(appliedResult.rows.map((row) => row.id));
  const files = await listMigrationFiles();
  const pool = getPool();

  for (const file of files) {
    if (applied.has(file)) {
      continue;
    }

    const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
    const client = await pool.connect();

    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into schema_migrations (id) values ($1)", [file]);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
}
