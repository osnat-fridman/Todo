import { existsSync, readFileSync, rmSync } from "node:fs";
import { createTestPool, restoreSnapshot, type SnapshotRow } from "../test-support/devSnapshot.js";
import { SNAPSHOT_FILE } from "./snapshot-path.js";

export default async function globalTeardown() {
  if (!existsSync(SNAPSHOT_FILE)) return;
  const rows = JSON.parse(readFileSync(SNAPSHOT_FILE, "utf8")) as SnapshotRow[];
  const pool = createTestPool();
  try {
    await restoreSnapshot(pool, rows);
    rmSync(SNAPSHOT_FILE);
  } finally {
    await pool.end();
  }
}
