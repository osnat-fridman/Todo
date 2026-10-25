import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestPool,
  replaceTasks,
  restoreSnapshot,
  takeSnapshot,
  type SnapshotRow,
} from "../test-support/devSnapshot.js";
import { lockTaskList } from "./listLock.js";
import {
  createTasksRepository,
  OrderConflictError,
  TaskLimitError,
  TaskNotFoundError,
  TaskValidationError,
} from "./tasksRepository.js";

const TODAY = "2026-10-25";
const MISSING_ID = "00000000-0000-4000-8000-000000000000";

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A second visitor's pool, already connected, so connection setup does not change who queues first. */
async function connectedPool(): Promise<pg.Pool> {
  const otherPool = createTestPool();
  await otherPool.query("select 1");
  return otherPool;
}

/**
 * Holds the shared list lock from a third connection while `start` queues operations behind it,
 * then releases it so they run in the order they were queued.
 */
async function withListLockHeld<T>(start: () => Promise<T>): Promise<T> {
  const lockPool = createTestPool();
  const client = await lockPool.connect();
  try {
    await client.query("begin");
    await lockTaskList(client);
    const work = start();
    await pause(500);
    await client.query("commit");
    return await work;
  } finally {
    client.release();
    await lockPool.end();
  }
}

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

  it("saves the status in both directions without touching details or position", async () => {
    const [task] = await replaceTasks(pool, [{ title: "א", description: "ת", dueDate: "2030-01-01", position: 0 }]);
    const repo = createTasksRepository(pool);
    expect(await repo.setTaskCompleted(task.id, true)).toEqual({ ...task, completed: true });
    expect(await repo.setTaskCompleted(task.id, false)).toEqual(task);
    expect(await repo.listTasks()).toEqual([task]);
    await expect(repo.setTaskCompleted(MISSING_ID, true)).rejects.toBeInstanceOf(TaskNotFoundError);
  });

  it("saves the exact new order with contiguous positions", async () => {
    const tasks = await replaceTasks(pool, [
      { title: "א", position: 0 },
      { title: "ב", position: 3, completed: true },
      { title: "ג", position: 8 },
    ]);
    const reordered = await createTasksRepository(pool).reorderTasks([tasks[2].id, tasks[0].id, tasks[1].id]);
    expect(reordered.map((t) => [t.title, t.position, t.completed])).toEqual([
      ["ג", 0, false],
      ["א", 1, false],
      ["ב", 2, true],
    ]);
    expect(await createTasksRepository(pool).listTasks()).toEqual(reordered);
  });

  it("refuses an order that does not list exactly the stored tasks, and changes nothing", async () => {
    const tasks = await replaceTasks(pool, [{ title: "א" }, { title: "ב" }, { title: "ג" }]);
    const [a, b, c] = tasks.map((t) => t.id);
    const repo = createTasksRepository(pool);
    for (const ids of [[b, a], [b, a, c, MISSING_ID], [b, a, MISSING_ID], [b, a, a], [c, b, a, a]]) {
      await expect(repo.reorderTasks(ids)).rejects.toBeInstanceOf(OrderConflictError);
    }
    expect(await repo.listTasks()).toEqual(tasks);
  });

  it("lets the last of two parallel reorders win, without mixing them", async () => {
    const tasks = await replaceTasks(pool, [{ title: "א" }, { title: "ב" }, { title: "ג" }, { title: "ד" }]);
    const [a, b, c, d] = tasks.map((t) => t.id);
    const otherPool = await connectedPool();
    try {
      await withListLockHeld(async () => {
        const first = createTasksRepository(pool).reorderTasks([d, c, b, a]);
        await pause(200);
        const second = createTasksRepository(otherPool).reorderTasks([b, a, d, c]);
        return Promise.all([first, second]);
      });
    } finally {
      await otherPool.end();
    }
    const stored = await createTasksRepository(pool).listTasks();
    expect(stored.map((t) => t.title)).toEqual(["ב", "א", "ד", "ג"]);
    expect(stored.map((t) => t.position)).toEqual([0, 1, 2, 3]);
  });

  it("keeps a create that runs right after a reorder, at the end", async () => {
    const tasks = await replaceTasks(pool, [{ title: "א" }, { title: "ב" }]);
    const otherPool = await connectedPool();
    try {
      await withListLockHeld(async () => {
        const reorder = createTasksRepository(pool).reorderTasks([tasks[1].id, tasks[0].id]);
        await pause(200);
        const create = createTasksRepository(otherPool).createTask({ title: "ג", description: null, dueDate: null });
        return Promise.all([reorder, create]);
      });
    } finally {
      await otherPool.end();
    }
    const stored = await createTasksRepository(pool).listTasks();
    expect(stored.map((t) => [t.title, t.position])).toEqual([
      ["ב", 0],
      ["א", 1],
      ["ג", 2],
    ]);
  });

  it("refuses a reorder that runs right after a create, and keeps the new task", async () => {
    const tasks = await replaceTasks(pool, [{ title: "א" }, { title: "ב" }]);
    const otherPool = await connectedPool();
    let reorderResult: unknown;
    try {
      await withListLockHeld(async () => {
        const create = createTasksRepository(otherPool).createTask({ title: "ג", description: null, dueDate: null });
        await pause(200);
        const reorder = createTasksRepository(pool)
          .reorderTasks([tasks[1].id, tasks[0].id])
          .catch((error: unknown) => error);
        [, reorderResult] = await Promise.all([create, reorder]);
      });
    } finally {
      await otherPool.end();
    }
    expect(reorderResult).toBeInstanceOf(OrderConflictError);
    const stored = await createTasksRepository(pool).listTasks();
    expect(stored.map((t) => [t.title, t.position])).toEqual([
      ["א", 0],
      ["ב", 1],
      ["ג", 2],
    ]);
  });

  it("refuses a reorder that runs right after a delete, and keeps positions contiguous", async () => {
    const tasks = await replaceTasks(pool, [{ title: "א" }, { title: "ב" }, { title: "ג" }]);
    const otherPool = await connectedPool();
    let reorderResult: unknown;
    try {
      await withListLockHeld(async () => {
        const remove = createTasksRepository(otherPool).deleteTask(tasks[0].id);
        await pause(200);
        const reorder = createTasksRepository(pool)
          .reorderTasks([tasks[2].id, tasks[1].id, tasks[0].id])
          .catch((error: unknown) => error);
        [, reorderResult] = await Promise.all([remove, reorder]);
      });
    } finally {
      await otherPool.end();
    }
    expect(reorderResult).toBeInstanceOf(OrderConflictError);
    const stored = await createTasksRepository(pool).listTasks();
    expect(stored.map((t) => [t.title, t.position])).toEqual([
      ["ב", 0],
      ["ג", 1],
    ]);
  });

  it("saves a status change while a reorder holds the list lock, and both are kept", async () => {
    const tasks = await replaceTasks(pool, [{ title: "א" }, { title: "ב" }]);
    const otherPool = await connectedPool();
    try {
      await withListLockHeld(async () => {
        const reorder = createTasksRepository(pool).reorderTasks([tasks[1].id, tasks[0].id]);
        // The status change needs no list lock, so it finishes while the reorder still waits.
        await createTasksRepository(otherPool).setTaskCompleted(tasks[0].id, true);
        return reorder;
      });
    } finally {
      await otherPool.end();
    }
    const stored = await createTasksRepository(pool).listTasks();
    expect(stored.map((t) => [t.title, t.position, t.completed])).toEqual([
      ["ב", 0, false],
      ["א", 1, true],
    ]);
  });
});
