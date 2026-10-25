import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../../server/db.js";
import { allowMethods, sendDatabaseError, sendJson } from "../../server/http.js";
import { createTasksRepository, type TasksRepository } from "../../server/tasksRepository.js";

export function createHandler(getRepository: () => TasksRepository) {
  return async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!allowMethods(req, res, ["GET"])) return;

    try {
      const tasks = await getRepository().listTasks();
      sendJson(res, 200, tasks);
    } catch (error) {
      sendDatabaseError(res, "GET /api/tasks", error);
    }
  };
}

export default createHandler(() => createTasksRepository(getPool()));
