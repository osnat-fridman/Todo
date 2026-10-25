// @vitest-environment node
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { describe, expect, it, vi } from "vitest";
import type { Task } from "../../../shared/types.js";
import { TaskNotFoundError, TaskValidationError, type TasksRepository } from "../../../server/tasksRepository.js";
import { createHandler } from "./index.js";

function fakeResponse() {
  const res = {
    statusCode: 0,
    ended: false,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    setHeader(name: string, value: string) {
      res.headers[name.toLowerCase()] = value;
      return res;
    },
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
    end() {
      res.ended = true;
      return res;
    },
  };
  return res;
}

const ID = "7c1f8a52-4c55-4f5e-9d0e-0a1b2c3d4e5f";
// 2026-10-25 12:00 in Israel.
const NOW = new Date("2026-10-25T09:00:00Z");

const saved: Task = {
  id: ID,
  title: "עודכנה",
  description: null,
  dueDate: "2026-11-01",
  completed: true,
  position: 4,
};

function call(
  method: string,
  repository: Partial<TasksRepository>,
  options: { id?: unknown; body?: unknown; headers?: Record<string, string> } = {},
) {
  const res = fakeResponse();
  const repo = { listTasks: vi.fn(), createTask: vi.fn(), updateTaskDetails: vi.fn(), deleteTask: vi.fn(), ...repository };
  const handler = createHandler(() => repo, () => NOW);
  const req = {
    method,
    query: { id: "id" in options ? options.id : ID },
    headers: options.headers ?? { "content-type": "application/json" },
    body: options.body,
  } as unknown as VercelRequest;
  return handler(req, res as unknown as VercelResponse).then(() => ({ res, repo }));
}

describe("PATCH /api/tasks/:id", () => {
  const body = { title: "  עודכנה ", description: "", dueDate: "2026-11-01" };

  it("saves the three detail fields and returns 200 with the task", async () => {
    const updateTaskDetails = vi.fn(async () => saved);
    const { res } = await call("PATCH", { updateTaskDetails }, { body });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(saved);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(updateTaskDetails).toHaveBeenCalledWith(ID, body, "2026-10-25");
  });

  it("ignores status and position in the body", async () => {
    const updateTaskDetails = vi.fn(async () => saved);
    await call("PATCH", { updateTaskDetails }, { body: { ...body, completed: false, position: 0 } });
    expect(updateTaskDetails).toHaveBeenCalledWith(ID, body, "2026-10-25");
  });

  it.each([
    [{ title: "x", description: null }],
    [{ title: "x", dueDate: null }],
    [{ description: "x", dueDate: null }],
    [{ title: 5, description: null, dueDate: null }],
  ])("rejects a body without all three fields as strings or null: %j", async (partial) => {
    const updateTaskDetails = vi.fn();
    const { res } = await call("PATCH", { updateTaskDetails }, { body: partial });
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: { code: "INVALID_REQUEST" } });
    expect(updateTaskDetails).not.toHaveBeenCalled();
  });

  it("rejects an id that is not a UUID", async () => {
    const updateTaskDetails = vi.fn();
    const { res } = await call("PATCH", { updateTaskDetails }, { id: "1; drop table tasks", body });
    expect(res.statusCode).toBe(400);
    expect(updateTaskDetails).not.toHaveBeenCalled();
  });

  it("rejects a body that is not JSON", async () => {
    const { res } = await call("PATCH", {}, { body, headers: { "content-type": "text/plain" } });
    expect(res.statusCode).toBe(400);
  });

  it("answers 404 when the task no longer exists", async () => {
    const { res } = await call(
      "PATCH",
      {
        updateTaskDetails: async () => {
          throw new TaskNotFoundError();
        },
      },
      { body },
    );
    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ error: { code: "TASK_NOT_FOUND" } });
  });

  it("answers 400 with the field when validation fails", async () => {
    const { res } = await call(
      "PATCH",
      {
        updateTaskDetails: async () => {
          throw new TaskValidationError([{ field: "dueDate", message: "תאריך היעד לא יכול להיות בעבר" }]);
        },
      },
      { body },
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: { code: "VALIDATION_ERROR", message: "תאריך היעד לא יכול להיות בעבר", field: "dueDate" },
    });
  });

  it("answers 503 without details when the database fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { res } = await call(
      "PATCH",
      {
        updateTaskDetails: async () => {
          throw new Error("connection refused");
        },
      },
      { body },
    );
    expect(res.statusCode).toBe(503);
    expect(JSON.stringify(res.body)).not.toContain("connection refused");
  });
});

describe("DELETE /api/tasks/:id", () => {
  it("deletes the task and answers 204 with no body", async () => {
    const deleteTask = vi.fn(async () => {});
    const { res } = await call("DELETE", { deleteTask });
    expect(res.statusCode).toBe(204);
    expect(res.ended).toBe(true);
    expect(res.body).toBeUndefined();
    expect(deleteTask).toHaveBeenCalledWith(ID);
  });

  it("answers 404 when the task no longer exists", async () => {
    const { res } = await call("DELETE", {
      deleteTask: async () => {
        throw new TaskNotFoundError();
      },
    });
    expect(res.statusCode).toBe(404);
  });

  it("rejects an id that is not a UUID", async () => {
    const deleteTask = vi.fn();
    const { res } = await call("DELETE", { deleteTask }, { id: "abc" });
    expect(res.statusCode).toBe(400);
    expect(deleteTask).not.toHaveBeenCalled();
  });
});

describe("other methods", () => {
  it("are rejected with 405", async () => {
    const { res, repo } = await call("GET", {});
    expect(res.statusCode).toBe(405);
    expect(res.headers.allow).toBe("PATCH, DELETE");
    expect(repo.updateTaskDetails).not.toHaveBeenCalled();
  });
});
