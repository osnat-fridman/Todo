import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../../../server/db.js";
import {
  allowMethods,
  readJsonBody,
  sendDatabaseError,
  sendError,
  sendJson,
  sendNotFound,
} from "../../../server/http.js";
import { isUuid } from "../../../server/taskInput.js";
import { createTasksRepository, TaskNotFoundError, type TasksRepository } from "../../../server/tasksRepository.js";

export function createHandler(getRepository: () => TasksRepository) {
  return async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!allowMethods(req, res, ["PATCH"])) return;

    const id = req.query?.id;
    if (!isUuid(id)) {
      sendError(res, 400, "INVALID_REQUEST", "מזהה המשימה אינו תקין.");
      return;
    }

    const body = readJsonBody(req, res);
    if (!body) return;
    // An explicit value, not a toggle, so a repeated request cannot flip the status back (ADR-9).
    if (typeof body.completed !== "boolean") {
      sendError(res, 400, "INVALID_REQUEST", "הבקשה אינה תקינה.");
      return;
    }

    try {
      const task = await getRepository().setTaskCompleted(id, body.completed);
      sendJson(res, 200, task);
    } catch (error) {
      if (error instanceof TaskNotFoundError) return sendNotFound(res);
      sendDatabaseError(res, "PATCH /api/tasks/:id/status", error);
    }
  };
}

export default createHandler(() => createTasksRepository(getPool()));
