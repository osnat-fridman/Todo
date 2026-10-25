import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../../server/db.js";
import { allowMethods, readJsonBody, sendDatabaseError, sendError, sendJson } from "../../server/http.js";
import { createTasksRepository, TaskLimitError, type TasksRepository } from "../../server/tasksRepository.js";
import {
  MESSAGES,
  PRODUCT_TIME_ZONE,
  todayInTimeZone,
  validateTaskInput,
  type TaskInput,
} from "../../shared/validation.js";

/** Reads title/description/dueDate as string-or-null (missing = null); returns null when a field has another type. */
function readTaskInput(body: Record<string, unknown>): TaskInput | null {
  const fields = ["title", "description", "dueDate"] as const;
  const input: Partial<TaskInput> = {};
  for (const field of fields) {
    const value = body[field] ?? null;
    if (value !== null && typeof value !== "string") return null;
    input[field] = value;
  }
  return input as TaskInput;
}

export function createHandler(getRepository: () => TasksRepository, now: () => Date = () => new Date()) {
  return async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!allowMethods(req, res, ["GET", "POST"])) return;

    if (req.method === "GET") {
      try {
        const tasks = await getRepository().listTasks();
        sendJson(res, 200, tasks);
      } catch (error) {
        sendDatabaseError(res, "GET /api/tasks", error);
      }
      return;
    }

    const body = readJsonBody(req, res);
    if (!body) return;
    const input = readTaskInput(body);
    if (!input) {
      sendError(res, 400, "INVALID_REQUEST", "הבקשה אינה תקינה.");
      return;
    }
    const { value, errors } = validateTaskInput(input, { today: todayInTimeZone(PRODUCT_TIME_ZONE, now()) });
    if (errors.length > 0) {
      sendError(res, 400, "VALIDATION_ERROR", errors[0].message, errors[0].field);
      return;
    }

    try {
      const task = await getRepository().createTask(value);
      sendJson(res, 201, task);
    } catch (error) {
      if (error instanceof TaskLimitError) {
        sendError(res, 409, "TASK_LIMIT_REACHED", MESSAGES.taskLimitReached);
        return;
      }
      sendDatabaseError(res, "POST /api/tasks", error);
    }
  };
}

export default createHandler(() => createTasksRepository(getPool()));
