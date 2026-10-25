import { rootCertificates } from "node:tls";
import { afterAll, describe, expect, it } from "vitest";
import { loadTestEnv } from "../test-support/devSnapshot.js";
import { createPool, isCertificateError } from "./db.js";

loadTestEnv();

describe("database connection (Dev)", () => {
  const pool = createPool();

  afterAll(async () => {
    await pool.end();
  });

  it("connects over TLS while verifying the Supabase CA", async () => {
    const { rows } = await pool.query<{ ok: number }>("select 1 as ok");
    expect(rows[0].ok).toBe(1);
  });

  it("refuses to connect when the server certificate does not match the trusted CA", async () => {
    // Node's public root CAs do not include the Supabase CA, so verification must fail.
    const wrongCaPool = createPool({ ca: [...rootCertificates] });
    try {
      const error = await wrongCaPool.query("select 1").then(
        () => null,
        (e: unknown) => e,
      );
      expect(error).not.toBeNull();
      expect(isCertificateError(error)).toBe(true);
    } finally {
      await wrongCaPool.end();
    }
  });
});
