import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../../../server/db.js";
import {
  allowMethods,
  readJsonBody,
  sendDatabaseError,
  sendError,
  sendJson,
  sendNoContent,
} from "../../../server/http.js";
import { isUuid, readTaskInput } from "../../../server/taskInput.js";
import {
  createTasksRepository,
  TaskNotFoundError,
  TaskValidationError,
  type TasksRepository,
} from "../../../server/tasksRepository.js";
import { PRODUCT_TIME_ZONE, todayInTimeZone } from "../../../shared/validation.js";

function sendNotFound(res: VercelResponse): void {
  sendError(res, 404, "TASK_NOT_FOUND", "המשימה כבר לא קיימת. ייתכן שנמחקה על ידי מבקר אחר.");
}

export function createHandler(getRepository: () => TasksRepository, now: () => Date = () => new Date()) {
  return async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!allowMethods(req, res, ["PATCH", "DELETE"])) return;

    const id = req.query?.id;
    if (!isUuid(id)) {
      sendError(res, 400, "INVALID_REQUEST", "מזהה המשימה אינו תקין.");
      return;
    }

    if (req.method === "DELETE") {
      try {
        await getRepository().deleteTask(id);
        sendNoContent(res);
      } catch (error) {
        if (error instanceof TaskNotFoundError) return sendNotFound(res);
        sendDatabaseError(res, "DELETE /api/tasks/:id", error);
      }
      return;
    }

    const body = readJsonBody(req, res);
    if (!body) return;
    // All three detail fields are required; completed/position are ignored (ADR-8).
    const input = readTaskInput(body, { requireAll: true });
    if (!input) {
      sendError(res, 400, "INVALID_REQUEST", "הבקשה אינה תקינה.");
      return;
    }

    try {
      const today = todayInTimeZone(PRODUCT_TIME_ZONE, now());
      const task = await getRepository().updateTaskDetails(id, input, today);
      sendJson(res, 200, task);
    } catch (error) {
      if (error instanceof TaskNotFoundError) return sendNotFound(res);
      if (error instanceof TaskValidationError) {
        const [first] = error.errors;
        sendError(res, 400, "VALIDATION_ERROR", first.message, first.field);
        return;
      }
      sendDatabaseError(res, "PATCH /api/tasks/:id", error);
    }
  };
}

export default createHandler(() => createTasksRepository(getPool()));
