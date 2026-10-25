import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../../server/db.js";
import { allowMethods, readJsonBody, sendDatabaseError, sendError, sendJson } from "../../server/http.js";
import { isUuid } from "../../server/taskInput.js";
import { createTasksRepository, OrderConflictError, type TasksRepository } from "../../server/tasksRepository.js";
import { TASK_LIMIT } from "../../shared/validation.js";

// 1,000 UUIDs are about 39KB of JSON (ADR-9).
const MAX_ORDER_BODY_BYTES = 64 * 1024;

export const ORDER_CONFLICT_MESSAGE = "הרשימה השתנתה בינתיים. רענן את הרשימה ונסה שוב.";

export function createHandler(getRepository: () => TasksRepository) {
  return async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!allowMethods(req, res, ["PUT"])) return;

    const body = readJsonBody(req, res, MAX_ORDER_BODY_BYTES);
    if (!body) return;
    const { orderedIds } = body;
    if (!Array.isArray(orderedIds) || orderedIds.length > TASK_LIMIT || !orderedIds.every(isUuid)) {
      sendError(res, 400, "INVALID_REQUEST", "הבקשה אינה תקינה.");
      return;
    }

    try {
      const tasks = await getRepository().reorderTasks(orderedIds);
      sendJson(res, 200, tasks);
    } catch (error) {
      if (error instanceof OrderConflictError) {
        sendError(res, 409, "ORDER_CONFLICT", ORDER_CONFLICT_MESSAGE);
        return;
      }
      sendDatabaseError(res, "PUT /api/tasks/order", error);
    }
  };
}

export default createHandler(() => createTasksRepository(getPool()));
