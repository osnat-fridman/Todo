// Display order of the list by due date (PRD FR-11, ADR-19).
// The stored position is the manual order, used only among tasks in the same date group.
import type { Task } from "../../shared/types";
import { PRODUCT_TIME_ZONE, todayInTimeZone } from "../../shared/validation";

type DatedTask = Pick<Task, "dueDate" | "completed">;

/** Today's date in Israel time, the same "today" as the due date validation (ADR-5). */
export function productToday(now: Date = new Date()): string {
  return todayInTimeZone(PRODUCT_TIME_ZONE, now);
}

/** An open task whose due date is before today. A completed task is never overdue. */
export function isOverdue(task: DatedTask, today: string): boolean {
  return !task.completed && task.dueDate !== null && task.dueDate < today;
}

/** 0 = overdue, 1 = other tasks with a due date, 2 = no due date. */
function bucket(task: DatedTask, today: string): number {
  if (task.dueDate === null) return 2;
  return isOverdue(task, today) ? 0 : 1;
}

/** Tasks with the same key can be dragged among themselves (PRD FR-07). */
export function orderGroup(task: DatedTask, today: string): string {
  return `${bucket(task, today)}:${task.dueDate ?? ""}`;
}

/** A new array: overdue first, then nearest due date first, then tasks without a date; ties by manual order. */
export function sortTasks(tasks: readonly Task[], today: string): Task[] {
  return [...tasks].sort(
    (a, b) =>
      bucket(a, today) - bucket(b, today) ||
      (a.dueDate ?? "").localeCompare(b.dueDate ?? "") ||
      a.position - b.position ||
      a.id.localeCompare(b.id),
  );
}

/** "2026-10-20" → "20/10/2026", without Date, so no time zone can shift the day. */
export function formatDueDate(dueDate: string): string {
  const [year, month, day] = dueDate.split("-");
  return `${day}/${month}/${year}`;
}
