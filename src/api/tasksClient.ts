import type { ApiError, Task } from "../../shared/types";
import { MESSAGES, type TaskField, type TaskInput } from "../../shared/validation";

export const SAVE_FAILED_MESSAGE = "השמירה נכשלה. נסה שוב.";
export const DELETE_FAILED_MESSAGE = "המחיקה נכשלה. נסה שוב.";
export const TOO_MANY_REQUESTS_MESSAGE = "יותר מדי בקשות. המתן מעט ונסה שוב.";
export const TASK_GONE_MESSAGE = "המשימה כבר לא קיימת. ייתכן שנמחקה על ידי מבקר אחר.";

/** Loads the shared task list from the server. Throws on network or HTTP errors. */
export async function fetchTasks(): Promise<Task[]> {
  const response = await fetch("/api/tasks", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load tasks (HTTP ${response.status})`);
  }
  return (await response.json()) as Task[];
}

type Failure =
  | { ok: false; notFound: true; field?: undefined; message: string }
  | { ok: false; notFound?: false; field: TaskField; message: string }
  | { ok: false; notFound?: false; field?: undefined; message: string };

export type TaskResult = { ok: true; task: Task } | Failure;
export type DeleteResult = { ok: true } | Failure;

const TASK_FIELDS: readonly string[] = ["title", "description", "dueDate"];

/** Sends a request; resolves to the response, or null when the network failed. */
function send(url: string, method: string, body?: unknown): Promise<Response | null> {
  return fetch(url, {
    method,
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  }).catch(() => null);
}

/** Turns a failed response into a field error or a general message. */
async function toFailure(response: Response | null, fallback: string): Promise<Failure> {
  if (!response) return { ok: false, message: fallback };
  if (response.status === 404) return { ok: false, notFound: true, message: TASK_GONE_MESSAGE };
  if (response.status === 409) return { ok: false, message: MESSAGES.taskLimitReached };
  if (response.status === 429) return { ok: false, message: TOO_MANY_REQUESTS_MESSAGE };
  if (response.status === 400) {
    const body = (await response.json().catch(() => null)) as ApiError | null;
    const field = body?.error.field;
    if (field && TASK_FIELDS.includes(field)) {
      return { ok: false, field: field as TaskField, message: body.error.message };
    }
  }
  return { ok: false, message: fallback };
}

/** Creates a task. Never throws: failures come back as a field error or a general message. */
export async function createTask(input: TaskInput): Promise<TaskResult> {
  const response = await send("/api/tasks", "POST", input);
  if (response?.status === 201) return { ok: true, task: (await response.json()) as Task };
  return toFailure(response, SAVE_FAILED_MESSAGE);
}

/** Saves a task's title, description and due date. Never throws. */
export async function updateTask(id: string, input: TaskInput): Promise<TaskResult> {
  const response = await send(`/api/tasks/${encodeURIComponent(id)}`, "PATCH", input);
  if (response?.status === 200) return { ok: true, task: (await response.json()) as Task };
  return toFailure(response, SAVE_FAILED_MESSAGE);
}

/** Deletes a task. Never throws. */
export async function deleteTask(id: string): Promise<DeleteResult> {
  const response = await send(`/api/tasks/${encodeURIComponent(id)}`, "DELETE");
  if (response?.status === 204) return { ok: true };
  return toFailure(response, DELETE_FAILED_MESSAGE);
}
