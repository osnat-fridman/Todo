import type { ApiError, Task } from "../../shared/types";
import { MESSAGES, type TaskField, type TaskInput } from "../../shared/validation";

export const SAVE_FAILED_MESSAGE = "השמירה נכשלה. נסה שוב.";
export const DELETE_FAILED_MESSAGE = "המחיקה נכשלה. נסה שוב.";
export const TOO_MANY_REQUESTS_MESSAGE = "יותר מדי בקשות. המתן מעט ונסה שוב.";
export const TASK_GONE_MESSAGE = "המשימה כבר לא קיימת. ייתכן שנמחקה על ידי מבקר אחר.";
export const STATUS_FAILED_MESSAGE = "שינוי הסטטוס נכשל. נסה שוב.";
export const ORDER_FAILED_MESSAGE = "שמירת הסדר נכשלה, והסדר הקודם הוחזר.";
export const ORDER_CONFLICT_MESSAGE = "הרשימה השתנתה בינתיים. רענן את הרשימה ונסה שוב.";
export const OFFLINE_ACTION_MESSAGE = "אין חיבור לאינטרנט. הפעולה לא בוצעה.";
export const LOAD_FAILED_MESSAGE = "לא ניתן לטעון את המשימות. רענן את הדף כדי לנסות שוב.";

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
  | { ok: false; conflict: true; notFound?: false; field?: undefined; message: string }
  | { ok: false; notFound?: false; field: TaskField; message: string }
  | { ok: false; notFound?: false; field?: undefined; message: string };

export type TaskResult = { ok: true; task: Task } | Failure;
export type DeleteResult = { ok: true } | Failure;
export type OrderResult = { ok: true; tasks: Task[] } | Failure;

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
  // The network failed: say so when the browser knows it is offline (ADR-18).
  if (!response) return { ok: false, message: navigator.onLine ? fallback : OFFLINE_ACTION_MESSAGE };
  if (response.status === 404) return { ok: false, notFound: true, message: TASK_GONE_MESSAGE };
  if (response.status === 429) return { ok: false, message: TOO_MANY_REQUESTS_MESSAGE };
  const body = (await response.json().catch(() => null)) as ApiError | null;
  if (response.status === 409) {
    // Two kinds of 409: a full list on create, or a stale list on reorder (ADR-9).
    if (body?.error.code === "ORDER_CONFLICT") return { ok: false, conflict: true, message: ORDER_CONFLICT_MESSAGE };
    return { ok: false, message: MESSAGES.taskLimitReached };
  }
  if (response.status === 400) {
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

/** Saves a task's status as an explicit value. Never throws. */
export async function setTaskCompleted(id: string, completed: boolean): Promise<TaskResult> {
  const response = await send(`/api/tasks/${encodeURIComponent(id)}/status`, "PATCH", { completed });
  if (response?.status === 200) return { ok: true, task: (await response.json()) as Task };
  return toFailure(response, STATUS_FAILED_MESSAGE);
}

/** Saves the order of the whole list; the ids must be every task the page knows. Never throws. */
export async function saveTaskOrder(orderedIds: string[]): Promise<OrderResult> {
  const response = await send("/api/tasks/order", "PUT", { orderedIds });
  if (response?.status === 200) return { ok: true, tasks: (await response.json()) as Task[] };
  return toFailure(response, ORDER_FAILED_MESSAGE);
}
