#!/usr/bin/env node
/**
 * run-migrations.js
 * Applies all *.sql files in backend/sql/migrations/ in lexicographic order.
 * Skips files already recorded in the schema_migrations tracking table.
 *
 * Usage (on EC2 after deployment):
 *   DATABASE_URL=... node run-migrations.js
 *
 * Or source backend/.env first:
 *   set -a; source backend/.env; set +a
 *   node run-migrations.js
 */

import "dotenv/config";
import { Pool } from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "sql", "migrations");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.SUPABASE_DB_SSL === "disable" ? false : { rejectUnauthorized: false },
});

async function main() {
  // Create tracking table if not exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const applied = new Set(
    (await pool.query("SELECT filename FROM schema_migrations")).rows.map((r) => r.filename)
  );

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`  skip  ${file} (already applied)`);
      continue;
    }
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    console.log(`  apply ${file} ...`);
    try {
      await pool.query(sql);
      await pool.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
      ran++;
    } catch (err) {
      console.error(`  ERROR in ${file}:`, err.message);
      process.exitCode = 1;
    }
  }

  console.log(`\nDone. ${ran} migration(s) applied.`);
  await pool.end();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
