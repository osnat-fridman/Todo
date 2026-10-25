import type { TaskInput } from "../shared/validation.js";

const TASK_FIELDS = ["title", "description", "dueDate"] as const;

/**
 * Reads title/description/dueDate as string-or-null; returns null when a field has another type.
 * A missing field is null, unless requireAll is set (PATCH, ADR-8), where it makes the input invalid.
 */
export function readTaskInput(
  body: Record<string, unknown>,
  options: { requireAll?: boolean } = {},
): TaskInput | null {
  const input: Partial<TaskInput> = {};
  for (const field of TASK_FIELDS) {
    if (options.requireAll && !(field in body)) return null;
    const value = body[field] ?? null;
    if (value !== null && typeof value !== "string") return null;
    input[field] = value;
  }
  return input as TaskInput;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}
