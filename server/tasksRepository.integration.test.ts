import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestPool,
  replaceTasks,
  restoreSnapshot,
  takeSnapshot,
  type SnapshotRow,
} from "../test-support/devSnapshot.js";
import {
  createTasksRepository,
  TaskLimitError,
  TaskNotFoundError,
  TaskValidationError,
} from "./tasksRepository.js";

const TODAY = "2026-10-25";
const MISSING_ID = "00000000-0000-4000-8000-000000000000";

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

  it("updates only the detail fields, not status or position", async () => {
    const [task] = await replaceTasks(pool, [{ title: "לפני", description: "תיאור", completed: true, position: 3 }]);
    const updated = await createTasksRepository(pool).updateTaskDetails(
      task.id,
      { title: "  אחרי ", description: "  ", dueDate: "2030-01-01" },
      TODAY,
    );
    expect(updated).toEqual({ ...task, title: "אחרי", description: null, dueDate: "2030-01-01" });
    expect((await createTasksRepository(pool).listTasks())[0]).toEqual(updated);
  });

  it("allows an unchanged past due date, and refuses changing it to another past date", async () => {
    const [task] = await replaceTasks(pool, [{ title: "ישנה", dueDate: "2020-05-05" }]);
    const repo = createTasksRepository(pool);
    await expect(
      repo.updateTaskDetails(task.id, { title: "עדיין ישנה", description: null, dueDate: "2020-05-05" }, TODAY),
    ).resolves.toMatchObject({ title: "עדיין ישנה", dueDate: "2020-05-05" });
    const error = await repo
      .updateTaskDetails(task.id, { title: "x", description: null, dueDate: "2020-05-06" }, TODAY)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TaskValidationError);
    expect((error as TaskValidationError).errors).toEqual([{ field: "dueDate", message: "תאריך היעד לא יכול להיות בעבר" }]);
    expect((await repo.listTasks())[0].title).toBe("עדיין ישנה");
  });

  it("answers not found when updating or deleting a task that does not exist", async () => {
    await replaceTasks(pool, [{ title: "א" }]);
    const repo = createTasksRepository(pool);
    await expect(
      repo.updateTaskDetails(MISSING_ID, { title: "x", description: null, dueDate: null }, TODAY),
    ).rejects.toBeInstanceOf(TaskNotFoundError);
    await expect(repo.deleteTask(MISSING_ID)).rejects.toBeInstanceOf(TaskNotFoundError);
  });

  it("lets the last of two parallel saves win, without touching status or position", async () => {
    const [task] = await replaceTasks(pool, [{ title: "ב", completed: true }, { title: "א" }]);
    const otherPool = createTestPool();
    const lockPool = createTestPool();
    const client = await lockPool.connect();
    try {
      // Hold the row lock so the first save waits, then let the second (later) save run after it.
      await client.query("begin");
      await client.query("select 1 from public.tasks where id = $1 for update", [task.id]);
      const first = createTasksRepository(pool).updateTaskDetails(
        task.id,
        { title: "מבקר 1", description: null, dueDate: null },
        TODAY,
      );
      await new Promise((resolve) => setTimeout(resolve, 300));
      const second = createTasksRepository(otherPool).updateTaskDetails(
        task.id,
        { title: "מבקר 2", description: "אחרון", dueDate: null },
        TODAY,
      );
      await new Promise((resolve) => setTimeout(resolve, 300));
      await client.query("commit");
      await Promise.all([first, second]);
    } finally {
      client.release();
      await otherPool.end();
      await lockPool.end();
    }
    const stored = (await createTasksRepository(pool).listTasks()).find((t) => t.id === task.id);
    expect(stored).toEqual({ ...task, title: "מבקר 2", description: "אחרון", dueDate: null });
  });

  it("deletes a task and renumbers positions without gaps", async () => {
    const tasks = await replaceTasks(pool, [
      { title: "א", position: 0 },
      { title: "ב", position: 4 },
      { title: "ג", position: 7 },
      { title: "ד", position: 9 },
    ]);
    const repo = createTasksRepository(pool);
    await repo.deleteTask(tasks[1].id);
    const remaining = await repo.listTasks();
    expect(remaining.map((t) => [t.title, t.position])).toEqual([
      ["א", 0],
      ["ג", 1],
      ["ד", 2],
    ]);
    await expect(repo.deleteTask(tasks[1].id)).rejects.toBeInstanceOf(TaskNotFoundError);
  });

  it("keeps positions contiguous when a delete and a create run in parallel", async () => {
    const tasks = await replaceTasks(pool, [{ title: "א" }, { title: "ב" }, { title: "ג" }]);
    const otherPool = createTestPool();
    try {
      await Promise.all([
        createTasksRepository(pool).deleteTask(tasks[0].id),
        createTasksRepository(otherPool).createTask({ title: "ד", description: null, dueDate: null }),
      ]);
    } finally {
      await otherPool.end();
    }
    const remaining = await createTasksRepository(pool).listTasks();
    expect(remaining.map((t) => t.position)).toEqual([0, 1, 2]);
    expect(remaining.map((t) => t.title)).toEqual(["ב", "ג", "ד"]);
  });
});
