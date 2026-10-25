import type { VercelRequest, VercelResponse } from "@vercel/node";
import { vi } from "vitest";
import type { TasksRepository } from "../server/tasksRepository.js";

// Helpers for API handler unit tests.

/** A repository whose methods are all mocks, with the given ones replaced. */
export function fakeRepository(overrides: Partial<TasksRepository> = {}): TasksRepository {
  return {
    listTasks: vi.fn(),
    createTask: vi.fn(),
    updateTaskDetails: vi.fn(),
    deleteTask: vi.fn(),
    setTaskCompleted: vi.fn(),
    reorderTasks: vi.fn(),
    ...overrides,
  };
}

/** Records what a handler sends. */
export function fakeResponse() {
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

export type FakeResponse = ReturnType<typeof fakeResponse>;

/** Calls a handler with a JSON request and returns the recorded response. */
export async function callHandler(
  handler: (req: VercelRequest, res: VercelResponse) => Promise<void>,
  request: { method: string; query?: Record<string, unknown>; body?: unknown; headers?: Record<string, string> },
): Promise<FakeResponse> {
  const res = fakeResponse();
  const req = {
    method: request.method,
    query: request.query ?? {},
    headers: request.headers ?? { "content-type": "application/json" },
    body: request.body,
  } as unknown as VercelRequest;
  await handler(req, res as unknown as VercelResponse);
  return res;
}
