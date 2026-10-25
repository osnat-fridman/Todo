// Loads .env into process.env for local scripts without printing any value.
import { existsSync } from "node:fs";

export function loadDotEnv() {
  if (existsSync(".env")) process.loadEnvFile(".env");
}

export function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. Fill it in the .env file (see .env.example).`);
    process.exit(1);
  }
  return value;
}
