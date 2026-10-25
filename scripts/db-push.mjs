// Applies new migrations to the linked Supabase project (Dev only, ADR-1).
import { spawnSync } from "node:child_process";
import { loadDotEnv, requireEnv } from "./env.mjs";

loadDotEnv();
requireEnv("SUPABASE_DB_PASSWORD");

const result = spawnSync("npx", ["supabase", "db", "push", "--linked", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
});
process.exit(result.status ?? 1);
