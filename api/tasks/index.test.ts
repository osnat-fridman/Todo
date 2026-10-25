// @vitest-environment node
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { describe, expect, it, vi } from "vitest";
import type { Task } from "../../shared/types.js";
import { TaskLimitError, type TasksRepository } from "../../server/tasksRepository.js";
import { fakeRepository, fakeResponse } from "../../test-support/apiHandlers.js";
import { createHandler } from "./index.js";

function call(method: string, listTasks: () => Promise<Task[]>) {
  const res = fakeResponse();
  const handler = createHandler(() => fakeRepository({ listTasks }));
  return handler({ method } as VercelRequest, res as unknown as VercelResponse).then(() => res);
}

// 2026-10-25 12:00 in Israel.
const NOW = new Date("2026-10-25T09:00:00Z");

function post(
  body: unknown,
  createTask: TasksRepository["createTask"],
  headers: Record<string, string> = { "content-type": "application/json" },
) {
  const res = fakeResponse();
  const handler = createHandler(() => fakeRepository({ createTask }), () => NOW);
  const req = { method: "POST", headers, body } as unknown as VercelRequest;
  return handler(req, res as unknown as VercelResponse).then(() => res);
}

const sampleTask: Task = {
  id: "7c1f8a52-4c55-4f5e-9d0e-0a1b2c3d4e5f",
  title: "משימה",
  description: null,
  dueDate: "2026-11-01",
  completed: false,
  position: 0,
};

describe("GET /api/tasks", () => {
  it("returns the tasks with no-store caching", async () => {
    const res = await call("GET", async () => [sampleTask]);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([sampleTask]);
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("returns an empty array when there are no tasks", async () => {
    const res = await call("GET", async () => []);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("rejects other methods with 405", async () => {
    const listTasks = vi.fn(async () => []);
    const res = await call("DELETE", listTasks);
    expect(res.statusCode).toBe(405);
    expect(res.headers.allow).toBe("GET, POST");
    expect(listTasks).not.toHaveBeenCalled();
  });

  it("answers 503 without database details when the database fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await call("GET", async () => {
      throw Object.assign(new Error("password authentication failed for user app_backend"), {
        code: "28P01",
      });
    });
    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({
      error: { code: "DB_UNAVAILABLE", message: expect.any(String) },
    });
    expect(JSON.stringify(res.body)).not.toContain("app_backend");
  });
});

describe("POST /api/tasks", () => {
  const created: Task = { ...sampleTask, title: "חדשה", dueDate: null, position: 3 };

  it("creates a task from trimmed values and returns 201", async () => {
    const createTask = vi.fn(async () => created);
    const res = await post({ title: "  חדשה  ", description: "   ", dueDate: "2026-10-25" }, createTask);
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual(created);
    expect(createTask).toHaveBeenCalledWith({ title: "חדשה", description: null, dueDate: "2026-10-25" });
  });

  it("treats missing fields as null and ignores status and position", async () => {
    const createTask = vi.fn(async () => created);
    const res = await post({ description: "רק תיאור", completed: true, position: 0 }, createTask);
    expect(res.statusCode).toBe(201);
    expect(createTask).toHaveBeenCalledWith({ title: null, description: "רק תיאור", dueDate: null });
  });

  it.each([
    [{ title: " ", description: "\n" }, "title", "יש להזין כותרת או תיאור למשימה"],
    [{ title: "א".repeat(101) }, "title", "הכותרת יכולה להכיל עד 100 תווים"],
    [{ description: "א".repeat(2001) }, "description", "התיאור יכול להכיל עד 2,000 תווים"],
    [{ title: "x", dueDate: "2026-10-24" }, "dueDate", "תאריך היעד לא יכול להיות בעבר"],
    [{ title: "x", dueDate: "2026-02-30" }, "dueDate", "תאריך היעד אינו תקין"],
  ])("rejects invalid input %j with 400 and the field", async (body, field, message) => {
    const createTask = vi.fn();
    const res = await post(body, createTask);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: { code: "VALIDATION_ERROR", message, field } });
    expect(createTask).not.toHaveBeenCalled();
  });

  it("rejects fields with the wrong type", async () => {
    const res = await post({ title: 5 }, vi.fn());
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: { code: "INVALID_REQUEST" } });
  });

  it("rejects a body that is not JSON or is too large", async () => {
    const createTask = vi.fn();
    expect((await post({ title: "x" }, createTask, { "content-type": "text/plain" })).statusCode).toBe(400);
    expect((await post({ title: "x".repeat(20_000) }, createTask)).statusCode).toBe(400);
    expect((await post([{ title: "x" }], createTask)).statusCode).toBe(400);
    expect(createTask).not.toHaveBeenCalled();
  });

  it("answers 409 TASK_LIMIT_REACHED when the list is full", async () => {
    const res = await post({ title: "x" }, async () => {
      throw new TaskLimitError();
    });
    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({
      error: {
        code: "TASK_LIMIT_REACHED",
        message: "הרשימה מלאה (1,000 משימות). כדי להוסיף משימה יש למחוק משימה קיימת.",
      },
    });
  });

  it("answers 503 without details when the database fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post({ title: "סוד" }, async () => {
      throw Object.assign(new Error("connection refused"), { code: "ECONNREFUSED" });
    });
    expect(res.statusCode).toBe(503);
    expect(JSON.stringify(res.body)).not.toContain("connection refused");
  });
});
