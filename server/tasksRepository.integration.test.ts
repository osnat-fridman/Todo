import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestPool,
  replaceTasks,
  restoreSnapshot,
  takeSnapshot,
  type SnapshotRow,
} from "../test-support/devSnapshot.js";
import { createTasksRepository } from "./tasksRepository.js";

describe("tasks repository (Dev)", () => {
  let pool: pg.Pool;
  let snapshot: SnapshotRow[];

  beforeAll(async () => {
    pool = createTestPool();
    snapshot = await takeSnapshot(pool);
  });

  afterAll(async () => {
    await restoreSnapshot(pool, snapshot);
    await pool.end();
  });

  it("returns an empty array when there are no tasks", async () => {
    await replaceTasks(pool, []);
    expect(await createTasksRepository(pool).listTasks()).toEqual([]);
  });

  it("returns tasks ordered by position", async () => {
    await replaceTasks(pool, [
      { title: "שלישית", position: 2 },
      { title: "ראשונה", position: 0 },
      { description: "שנייה בלי כותרת", position: 1, completed: true },
    ]);
    const tasks = await createTasksRepository(pool).listTasks();
    expect(tasks.map((t) => t.title ?? t.description)).toEqual(["ראשונה", "שנייה בלי כותרת", "שלישית"]);
    expect(tasks[1]).toMatchObject({ title: null, completed: true, position: 1 });
  });

  it("breaks position ties by id so the order is stable", async () => {
    await replaceTasks(pool, [
      { title: "א", position: 0 },
      { title: "ב", position: 0 },
      { title: "ג", position: 0 },
    ]);
    const ids = (await createTasksRepository(pool).listTasks()).map((t) => t.id);
    expect(ids).toEqual([...ids].sort());
  });

  it("returns the due date as YYYY-MM-DD and null when missing", async () => {
    await replaceTasks(pool, [
      { title: "עם תאריך", dueDate: "2026-12-31" },
      { title: "בלי תאריך", dueDate: null },
    ]);
    const tasks = await createTasksRepository(pool).listTasks();
    expect(tasks.map((t) => t.dueDate)).toEqual(["2026-12-31", null]);
  });

  it("rejects a task whose title and description are only whitespace", async () => {
    const error = await pool
      .query("insert into public.tasks (title, description, position) values ('   ', E'\\n\\t', 0)")
      .then(
        () => null,
        (e: { code?: string }) => e,
      );
    expect(error?.code).toBe("23514");
  });
});
