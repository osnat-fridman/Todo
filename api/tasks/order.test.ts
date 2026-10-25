// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { Task } from "../../shared/types.js";
import { OrderConflictError, type TasksRepository } from "../../server/tasksRepository.js";
import { callHandler, fakeRepository } from "../../test-support/apiHandlers.js";
import { createHandler } from "./order.js";

const A = "7c1f8a52-4c55-4f5e-9d0e-0a1b2c3d4e5f";
const B = "0b6c3a1e-2f4d-4e8a-9b1c-5d6e7f8a9b0c";

const tasks: Task[] = [
  { id: B, title: "ב", description: null, dueDate: null, completed: false, position: 0 },
  { id: A, title: "א", description: null, dueDate: null, completed: true, position: 1 },
];

function uuid(n: number): string {
  return `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
}

function call(
  repository: Partial<TasksRepository>,
  request: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
) {
  return callHandler(createHandler(() => fakeRepository(repository)), {
    method: request.method ?? "PUT",
    body: "body" in request ? request.body : { orderedIds: [B, A] },
    headers: request.headers,
  });
}

describe("PUT /api/tasks/order", () => {
  it("saves the order and returns 200 with the list in its new order", async () => {
    const reorderTasks = vi.fn(async () => tasks);
    const res = await call({ reorderTasks });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(tasks);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(reorderTasks).toHaveBeenCalledWith([B, A]);
  });

  it("accepts 1,000 ids, which needs more than the usual 16KB body limit", async () => {
    const ids = Array.from({ length: 1000 }, (_, n) => uuid(n));
    const reorderTasks = vi.fn(async () => []);
    const res = await call({ reorderTasks }, { body: { orderedIds: ids } });
    expect(res.statusCode).toBe(200);
    expect(reorderTasks).toHaveBeenCalledWith(ids);
  });

  it.each([
    ["no orderedIds", {}],
    ["orderedIds is not an array", { orderedIds: A }],
    ["an id that is not a UUID", { orderedIds: [A, "abc"] }],
    ["an id that is not a string", { orderedIds: [A, 5] }],
    ["more than 1,000 ids", { orderedIds: Array.from({ length: 1001 }, (_, n) => uuid(n)) }],
  ])("answers 400 for %s", async (_name, body) => {
    const reorderTasks = vi.fn();
    const res = await call({ reorderTasks }, { body });
    expect(res.statusCode).toBe(400);
    expect(reorderTasks).not.toHaveBeenCalled();
  });

  it("answers 400 for a body larger than 64KB", async () => {
    const reorderTasks = vi.fn();
    const res = await call({ reorderTasks }, { body: { orderedIds: [A], padding: "x".repeat(65 * 1024) } });
    expect(res.statusCode).toBe(400);
    expect(reorderTasks).not.toHaveBeenCalled();
  });

  it("answers 409 ORDER_CONFLICT when the ids do not match the stored tasks", async () => {
    const res = await call({
      reorderTasks: vi.fn(async () => {
        throw new OrderConflictError();
      }),
    });
    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({
      error: { code: "ORDER_CONFLICT", message: "הרשימה השתנתה בינתיים. רענן את הרשימה ונסה שוב." },
    });
  });

  it("answers 405 for other methods", async () => {
    const res = await call({}, { method: "PATCH" });
    expect(res.statusCode).toBe(405);
    expect(res.headers.allow).toBe("PUT");
  });

  it("answers 503 without details when the database fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await call({
      reorderTasks: vi.fn(async () => {
        throw new Error("password=secret");
      }),
    });
    expect(res.statusCode).toBe(503);
    expect(JSON.stringify(res.body)).not.toContain("secret");
  });
});
