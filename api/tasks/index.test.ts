// @vitest-environment node
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { describe, expect, it, vi } from "vitest";
import type { Task } from "../../shared/types.js";
import { createHandler } from "./index.js";

function fakeResponse() {
  const res = {
    statusCode: 0,
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
  };
  return res;
}

function call(method: string, listTasks: () => Promise<Task[]>) {
  const res = fakeResponse();
  const handler = createHandler(() => ({ listTasks }));
  return handler({ method } as VercelRequest, res as unknown as VercelResponse).then(() => res);
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
    const res = await call("POST", listTasks);
    expect(res.statusCode).toBe(405);
    expect(res.headers.allow).toBe("GET");
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
