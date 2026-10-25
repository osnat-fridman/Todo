import { existsSync } from "node:fs";
import type pg from "pg";
import { createPool } from "../server/db.js";
import type { Task } from "../shared/types.js";

// Helpers for tests that run against the Supabase Dev project (ADR-7, ADR-11).
// They save the task table before tests and put it back exactly afterwards.

export function loadTestEnv(): void {
  if (existsSync(".env")) process.loadEnvFile(".env");
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL (Dev) is not set in .env; database tests cannot run.");
  }
}

export function createTestPool(): pg.Pool {
  loadTestEnv();
  return createPool();
}

export type SnapshotRow = {
  id: string;
  title: string | null;
  description: string | null;
  due_date: string | null;
  completed: boolean;
  position: number;
  created_at: string;
  updated_at: string;
};

export async function takeSnapshot(pool: pg.Pool): Promise<SnapshotRow[]> {
  // Timestamps and dates as text so they round-trip exactly (microseconds, no time zones).
  const { rows } = await pool.query<SnapshotRow>(
    `select id, title, description, to_char(due_date, 'YYYY-MM-DD') as due_date, completed,
            position, created_at::text as created_at, updated_at::text as updated_at
       from public.tasks`,
  );
  return rows;
}

export async function restoreSnapshot(pool: pg.Pool, rows: SnapshotRow[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("delete from public.tasks");
    await client.query(
      `insert into public.tasks (id, title, description, due_date, completed, position, created_at, updated_at)
       select id, title, description, due_date, completed, position, created_at, updated_at
         from json_populate_recordset(null::public.tasks, $1::json)`,
      [JSON.stringify(rows)],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export type NewTask = {
  title?: string | null;
  description?: string | null;
  dueDate?: string | null;
  completed?: boolean;
  position?: number;
};

/** Replaces the whole task list. Positions default to the array order. Returns the stored tasks in list order. */
export async function replaceTasks(pool: pg.Pool, tasks: NewTask[]): Promise<Task[]> {
  const rows = tasks.map((task, index) => ({
    title: task.title ?? null,
    description: task.description ?? null,
    due_date: task.dueDate ?? null,
    completed: task.completed ?? false,
    position: task.position ?? index,
  }));
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("delete from public.tasks");
    await client.query(
      `insert into public.tasks (title, description, due_date, completed, position)
       select title, description, due_date, completed, position
         from json_populate_recordset(null::public.tasks, $1::json)`,
      [JSON.stringify(rows)],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
  const { rows: stored } = await pool.query<Task>(
    `select id, title, description, to_char(due_date, 'YYYY-MM-DD') as "dueDate", completed, position
       from public.tasks order by position, id`,
  );
  return stored;
}
