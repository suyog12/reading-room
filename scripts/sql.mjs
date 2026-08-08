/**
 * Run a .sql file against the database from the terminal.
 *
 *   npm install --save-dev pg
 *   node --env-file=.env.local scripts/sql.mjs supabase/verify.sql
 *   node --env-file=.env.local scripts/sql.mjs supabase/007_delete.sql
 *
 * Needs DATABASE_URL in .env.local. Get it from Supabase:
 *   Project Settings > Database > Connection string > URI
 *
 * Use the SESSION POOLER string, not the direct one. Direct connections are
 * IPv6 only on many Supabase projects, and most home networks are not, which
 * shows up as a connection timeout that looks like a firewall problem.
 *
 * That string contains the database password. It is a different secret from
 * the service role key and belongs in .env.local, never in the repo.
 */

import { readFileSync } from "node:fs";
import pg from "pg";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node --env-file=.env.local scripts/sql.mjs <file.sql>");
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set in .env.local");
  console.error("Supabase > Project Settings > Database > Connection string > URI (session pooler)");
  process.exit(1);
}

const sql = readFileSync(file, "utf8");
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  console.log(`\n${file}\n`);

  // node-postgres returns an array when the text holds several statements.
  const out = await client.query(sql);
  const results = Array.isArray(out) ? out : [out];

  let printed = 0;
  for (const r of results) {
    if (!r.rows || r.rows.length === 0) continue;
    console.table(r.rows);
    printed++;
  }

  if (printed === 0) {
    console.log("Ran with no rows returned. For a migration that is success.");
  }
} catch (err) {
  console.error("\nFailed:", err.message);
  if (err.position) console.error("at character", err.position);
  process.exitCode = 1;
} finally {
  await client.end();
}
