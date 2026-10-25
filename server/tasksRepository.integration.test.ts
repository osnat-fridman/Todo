import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestPool,
  replaceTasks,
  restoreSnapshot,
  takeSnapshot,
  type SnapshotRow,
} from "../test-support/devSnapshot.js";
import { createTasksRepository, TaskLimitError } from "./tasksRepository.js";

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

  it("creates a task at the end of the list as not completed", async () => {
    await replaceTasks(pool, [
      { title: "א", position: 0 },
      { title: "ב", position: 5 },
    ]);
    const repo = createTasksRepository(pool);
    const task = await repo.createTask({ title: "חדשה", description: null, dueDate: "2030-02-01" });
    expect(task).toMatchObject({ title: "חדשה", description: null, dueDate: "2030-02-01", completed: false, position: 6 });
    const tasks = await repo.listTasks();
    expect(tasks.map((t) => t.title)).toEqual(["א", "ב", "חדשה"]);
  });

  it("creates the first task at position 0 in an empty list", async () => {
    await replaceTasks(pool, []);
    const task = await createTasksRepository(pool).createTask({ title: null, description: "תיאור", dueDate: null });
    expect(task).toMatchObject({ title: null, description: "תיאור", dueDate: null, position: 0, completed: false });
  });

  it("refuses to create a task when the list holds 1,000 tasks", async () => {
    await replaceTasks(pool, Array.from({ length: 1000 }, (_, i) => ({ title: `משימה ${i}` })));
    const repo = createTasksRepository(pool);
    await expect(repo.createTask({ title: "עוד", description: null, dueDate: null })).rejects.toBeInstanceOf(TaskLimitError);
    const { rows } = await pool.query<{ count: number }>("select count(*)::int as count from public.tasks");
    expect(rows[0].count).toBe(1000);
  });

  it("lets only one of two parallel creates fill the last place", async () => {
    await replaceTasks(pool, Array.from({ length: 999 }, (_, i) => ({ title: `משימה ${i}` })));
    const otherPool = createTestPool();
    try {
      const results = await Promise.allSettled([
        createTasksRepository(pool).createTask({ title: "מבקר 1", description: null, dueDate: null }),
        createTasksRepository(otherPool).createTask({ title: "מבקר 2", description: null, dueDate: null }),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const rejected = results.filter((r) => r.status === "rejected");
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(TaskLimitError);
    } finally {
      await otherPool.end();
    }
    const { rows } = await pool.query<{ count: number }>("select count(*)::int as count from public.tasks");
    expect(rows[0].count).toBe(1000);
  });

  it("gives parallel creates different positions at the end", async () => {
    await replaceTasks(pool, [{ title: "א" }, { title: "ב" }]);
    const otherPool = createTestPool();
    try {
      await Promise.all([
        createTasksRepository(pool).createTask({ title: "ג", description: null, dueDate: null }),
        createTasksRepository(otherPool).createTask({ title: "ד", description: null, dueDate: null }),
      ]);
    } finally {
      await otherPool.end();
    }
    const positions = (await createTasksRepository(pool).listTasks()).map((t) => t.position);
    expect(positions).toEqual([0, 1, 2, 3]);
  });
});
