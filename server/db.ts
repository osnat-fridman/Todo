import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

// Server-only database access. Never import this from src/.

const CA_PATH = path.join(process.cwd(), "certs", "supabase-ca.crt");

const CERTIFICATE_ERROR_CODES = new Set([
  "SELF_SIGNED_CERT_IN_CHAIN",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "CERT_HAS_EXPIRED",
  "ERR_TLS_CERT_ALTNAME_INVALID",
]);

export function isCertificateError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && CERTIFICATE_ERROR_CODES.has(code);
}

/** Removes sslmode from the URL so the explicit ssl options below are the only TLS settings. */
function connectionStringWithoutSslMode(raw: string): string {
  const url = new URL(raw);
  url.searchParams.delete("sslmode");
  return url.toString();
}

export function createPool(options: { connectionString?: string; ca?: string | string[] } = {}): pg.Pool {
  const connectionString = options.connectionString ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Add it to the environment (see .env.example).");
  }

  const pool = new pg.Pool({
    connectionString: connectionStringWithoutSslMode(connectionString),
    ssl: { ca: options.ca ?? readFileSync(CA_PATH, "utf8"), rejectUnauthorized: true },
    // One connection per function instance, as recommended for the Transaction Pooler.
    max: 1,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 10_000,
    query_timeout: 10_000,
  });

  pool.on("error", (error) => {
    console.error("Idle database client error:", error.message);
  });

  return pool;
}

let sharedPool: pg.Pool | undefined;

/** Module-level pool, reused across invocations of the same function instance. */
export function getPool(): pg.Pool {
  sharedPool ??= createPool();
  return sharedPool;
}

/** Logs a database failure without connection details or task content. */
export function logDatabaseError(context: string, error: unknown): void {
  if (isCertificateError(error)) {
    console.error(
      `${context}: the database server certificate could not be verified. ` +
        "Check that certs/supabase-ca.crt is the current Supabase CA certificate.",
    );
    return;
  }
  const code = (error as { code?: unknown } | null)?.code;
  console.error(`${context}: database error${typeof code === "string" ? ` (${code})` : ""}.`);
}
