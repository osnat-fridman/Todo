// Loads supabase/dev-seed.sql into the Dev database (DATABASE_URL in .env).
import { readFileSync } from "node:fs";
import pg from "pg";
import { loadDotEnv, requireEnv } from "./env.mjs";

loadDotEnv();
const url = new URL(requireEnv("DATABASE_URL"));
url.searchParams.delete("sslmode");

const client = new pg.Client({
  connectionString: url.toString(),
  ssl: { ca: readFileSync("certs/supabase-ca.crt", "utf8"), rejectUnauthorized: true },
});

try {
  await client.connect();
  await client.query(readFileSync("supabase/dev-seed.sql", "utf8"));
  const { rows } = await client.query("select count(*)::int as count from public.tasks");
  console.log(`Seed loaded: ${rows[0].count} tasks in the Dev database.`);
} catch (error) {
  console.error("Seeding failed:", error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
