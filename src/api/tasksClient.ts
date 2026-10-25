import type { ApiError, Task } from "../../shared/types";
import { MESSAGES, type TaskField, type TaskInput } from "../../shared/validation";

export const SAVE_FAILED_MESSAGE = "השמירה נכשלה. נסה שוב.";
export const TOO_MANY_REQUESTS_MESSAGE = "יותר מדי בקשות. המתן מעט ונסה שוב.";

/** Loads the shared task list from the server. Throws on network or HTTP errors. */
export async function fetchTasks(): Promise<Task[]> {
  const response = await fetch("/api/tasks", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load tasks (HTTP ${response.status})`);
  }
  return (await response.json()) as Task[];
}

export type CreateTaskResult =
  | { ok: true; task: Task }
  | { ok: false; field: TaskField; message: string }
  | { ok: false; field?: undefined; message: string };

const TASK_FIELDS: readonly string[] = ["title", "description", "dueDate"];

/** Creates a task. Never throws: failures come back as a field error or a general message. */
export async function createTask(input: TaskInput): Promise<CreateTaskResult> {
  let response: Response;
  try {
    response = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    return { ok: false, message: SAVE_FAILED_MESSAGE };
  }

  if (response.status === 201) {
    return { ok: true, task: (await response.json()) as Task };
  }
  if (response.status === 409) return { ok: false, message: MESSAGES.taskLimitReached };
  if (response.status === 429) return { ok: false, message: TOO_MANY_REQUESTS_MESSAGE };
  if (response.status === 400) {
    const body = (await response.json().catch(() => null)) as ApiError | null;
    const field = body?.error.field;
    if (field && TASK_FIELDS.includes(field)) {
      return { ok: false, field: field as TaskField, message: body.error.message };
    }
  }
  return { ok: false, message: SAVE_FAILED_MESSAGE };
}
