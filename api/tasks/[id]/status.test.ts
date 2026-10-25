// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { Task } from "../../../shared/types.js";
import { TaskNotFoundError, type TasksRepository } from "../../../server/tasksRepository.js";
import { callHandler, fakeRepository } from "../../../test-support/apiHandlers.js";
import { createHandler } from "./status.js";

const ID = "7c1f8a52-4c55-4f5e-9d0e-0a1b2c3d4e5f";

const task: Task = { id: ID, title: "א", description: null, dueDate: null, completed: true, position: 2 };

function call(repository: Partial<TasksRepository>, request: { method?: string; id?: unknown; body?: unknown } = {}) {
  return callHandler(createHandler(() => fakeRepository(repository)), {
    method: request.method ?? "PATCH",
    query: { id: "id" in request ? request.id : ID },
    body: "body" in request ? request.body : { completed: true },
  });
}

describe("PATCH /api/tasks/:id/status", () => {
  it("saves the explicit value and returns 200 with the task", async () => {
    const setTaskCompleted = vi.fn(async () => task);
    const res = await call({ setTaskCompleted });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(task);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(setTaskCompleted).toHaveBeenCalledWith(ID, true);
  });

  it("can set a completed task back to not completed", async () => {
    const setTaskCompleted = vi.fn(async () => ({ ...task, completed: false }));
    await call({ setTaskCompleted }, { body: { completed: false } });
    expect(setTaskCompleted).toHaveBeenCalledWith(ID, false);
  });

  it.each([[{}], [{ completed: "true" }], [{ completed: null }], [{ completed: 1 }]])(
    "answers 400 when completed is not a boolean (%j)",
    async (body) => {
      const setTaskCompleted = vi.fn();
      const res = await call({ setTaskCompleted }, { body });
      expect(res.statusCode).toBe(400);
      expect(setTaskCompleted).not.toHaveBeenCalled();
    },
  );

  it("answers 400 for an id that is not a UUID", async () => {
    const setTaskCompleted = vi.fn();
    const res = await call({ setTaskCompleted }, { id: "abc" });
    expect(res.statusCode).toBe(400);
    expect(setTaskCompleted).not.toHaveBeenCalled();
  });

  it("answers 404 when the task no longer exists", async () => {
    const res = await call({
      setTaskCompleted: vi.fn(async () => {
        throw new TaskNotFoundError();
      }),
    });
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({
      error: { code: "TASK_NOT_FOUND", message: "המשימה כבר לא קיימת. ייתכן שנמחקה על ידי מבקר אחר." },
    });
  });

  it("answers 405 for other methods", async () => {
    const res = await call({}, { method: "POST" });
    expect(res.statusCode).toBe(405);
    expect(res.headers.allow).toBe("PATCH");
  });

  it("answers 503 without details when the database fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await call({
      setTaskCompleted: vi.fn(async () => {
        throw new Error("password=secret");
      }),
    });
    expect(res.statusCode).toBe(503);
    expect(JSON.stringify(res.body)).not.toContain("secret");
  });
});
