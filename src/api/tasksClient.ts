import type { Task } from "../../shared/types";

/** Loads the shared task list from the server. Throws on network or HTTP errors. */
export async function fetchTasks(): Promise<Task[]> {
  const response = await fetch("/api/tasks", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load tasks (HTTP ${response.status})`);
  }
  return (await response.json()) as Task[];
}
