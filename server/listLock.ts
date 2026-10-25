import type pg from "pg";

// One transaction-level advisory lock for every change to the list's structure
// (create, delete, reorder), so they never interleave (ARCHITECTURE.md 2.6).
const TASK_LIST_LOCK_KEY = 7_316_001;

/** Takes the shared list lock. Must run inside a transaction on the same client; released on commit/rollback. */
export async function lockTaskList(client: pg.PoolClient): Promise<void> {
  await client.query("select pg_advisory_xact_lock($1)", [TASK_LIST_LOCK_KEY]);
}
