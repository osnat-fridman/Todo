import { mkdirSync, writeFileSync } from "node:fs";
import { createTestPool, takeSnapshot } from "../test-support/devSnapshot.js";
import { SNAPSHOT_DIR, SNAPSHOT_FILE } from "./snapshot-path.js";

export default async function globalSetup() {
  const pool = createTestPool();
  try {
    const rows = await takeSnapshot(pool);
    mkdirSync(SNAPSHOT_DIR, { recursive: true });
    writeFileSync(SNAPSHOT_FILE, JSON.stringify(rows));
  } finally {
    await pool.end();
  }
}
