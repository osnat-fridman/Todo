import type { Task } from "../../shared/types";

function hasContent(value: string | null): value is string {
  return value !== null && value.trim() !== "";
}

/**
 * Text shown in a list row: the title, or the description when there is no title.
 * Line breaks become spaces; visual truncation is done in CSS.
 */
export function taskLabel(task: Pick<Task, "title" | "description">): string {
  const text = hasContent(task.title) ? task.title : (task.description ?? "");
  return text.replace(/\s+/g, " ").trim();
}
