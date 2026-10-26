// Task input rules shared by the browser and the server (ADR-5, ADR-6).
// Must stay browser-safe: no secrets, no database access, no Node-only APIs.

/** Time zone used for the binding "not in the past" check on the server. */
export const PRODUCT_TIME_ZONE = "Asia/Jerusalem";

export const TITLE_MAX = 100;
export const DESCRIPTION_MAX = 2000;
export const TASK_LIMIT = 1000;

export const MESSAGES = {
  titleOrDescription: "יש להזין כותרת או תיאור למשימה",
  titleTooLong: "הכותרת יכולה להכיל עד 100 תווים",
  descriptionTooLong: "התיאור יכול להכיל עד 2,000 תווים",
  dueDateInPast: "תאריך היעד לא יכול להיות בעבר",
  dueDateInvalid: "תאריך היעד אינו תקין",
  taskLimitReached: "הרשימה מלאה (1,000 משימות). כדי להוסיף משימה יש למחוק משימה קיימת.",
  dragOutsideDateGroup: "אפשר להזיז משימה רק בין משימות עם אותו תאריך יעד.",
} as const;

export type TaskField = "title" | "description" | "dueDate";

export type FieldError = { field: TaskField; message: string };

export type TaskInput = {
  title: string | null;
  description: string | null;
  dueDate: string | null;
};

/** Trims a text value; an empty result becomes null. */
export function normalizeText(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

/** Length in characters (code points), the way PostgreSQL varchar counts. */
export function textLength(value: string): number {
  return [...value].length;
}

/** True for a real calendar date written as YYYY-MM-DD. */
export function isValidDateString(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Today's date as YYYY-MM-DD in the given time zone. */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): string {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Today's date as YYYY-MM-DD on this device (not toISOString, which is UTC). */
export function localToday(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Validates and normalizes task details.
 * The "not in the past" rule is skipped when the date equals storedDueDate (an unchanged date on update).
 * The "title or description" error is reported on the title field and applies to both fields.
 */
export function validateTaskInput(
  input: TaskInput,
  options: { today: string; storedDueDate?: string | null },
): { value: TaskInput; errors: FieldError[] } {
  const title = normalizeText(input.title);
  const description = normalizeText(input.description);
  const dueDate = input.dueDate === null || input.dueDate === "" ? null : input.dueDate;
  const errors: FieldError[] = [];

  if (title === null && description === null) {
    errors.push({ field: "title", message: MESSAGES.titleOrDescription });
  }
  if (title !== null && textLength(title) > TITLE_MAX) {
    errors.push({ field: "title", message: MESSAGES.titleTooLong });
  }
  if (description !== null && textLength(description) > DESCRIPTION_MAX) {
    errors.push({ field: "description", message: MESSAGES.descriptionTooLong });
  }
  if (dueDate !== null) {
    if (!isValidDateString(dueDate)) {
      errors.push({ field: "dueDate", message: MESSAGES.dueDateInvalid });
    } else if (dueDate !== options.storedDueDate && dueDate < options.today) {
      errors.push({ field: "dueDate", message: MESSAGES.dueDateInPast });
    }
  }

  return { value: { title, description, dueDate }, errors };
}
