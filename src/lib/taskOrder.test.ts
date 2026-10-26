import { describe, expect, it } from "vitest";
import type { Task } from "../../shared/types";
import { formatDueDate, isOverdue, orderGroup, productToday, sortTasks } from "./taskOrder";

const TODAY = "2026-10-26";

function task(id: string, dueDate: string | null, position: number, completed = false): Task {
  return { id, title: id, description: null, dueDate, completed, position };
}

describe("isOverdue", () => {
  it("is true for an open task due before today", () => {
    expect(isOverdue(task("a", "2026-10-25", 0), TODAY)).toBe(true);
  });

  it("is false for a task due today, in the future or without a date", () => {
    expect(isOverdue(task("a", TODAY, 0), TODAY)).toBe(false);
    expect(isOverdue(task("a", "2026-10-27", 0), TODAY)).toBe(false);
    expect(isOverdue(task("a", null, 0), TODAY)).toBe(false);
  });

  it("is false for a completed task, even when its date has passed", () => {
    expect(isOverdue(task("a", "2026-10-01", 0, true), TODAY)).toBe(false);
  });
});

describe("sortTasks", () => {
  it("puts overdue first, then nearest date first, then tasks without a date", () => {
    const tasks = [
      task("none", null, 0),
      task("far", "2026-12-01", 1),
      task("late-new", "2026-10-25", 2),
      task("today", TODAY, 3),
      task("late-old", "2026-10-01", 4),
      task("done-past", "2026-10-02", 5, true),
    ];
    expect(sortTasks(tasks, TODAY).map((t) => t.id)).toEqual([
      "late-old",
      "late-new",
      "done-past",
      "today",
      "far",
      "none",
    ]);
  });

  it("keeps the manual order among tasks with the same date, and among tasks without one", () => {
    const tasks = [task("b", TODAY, 5), task("y", null, 1), task("a", TODAY, 2), task("x", null, 0)];
    expect(sortTasks(tasks, TODAY).map((t) => t.id)).toEqual(["a", "b", "x", "y"]);
  });

  it("does not change the given array", () => {
    const tasks = [task("b", null, 1), task("a", TODAY, 0)];
    sortTasks(tasks, TODAY);
    expect(tasks.map((t) => t.id)).toEqual(["b", "a"]);
  });
});

describe("orderGroup", () => {
  it("groups by due date, and keeps overdue and completed tasks of the same date apart", () => {
    expect(orderGroup(task("a", TODAY, 0), TODAY)).toBe(orderGroup(task("b", TODAY, 1, true), TODAY));
    expect(orderGroup(task("a", null, 0), TODAY)).toBe(orderGroup(task("b", null, 1), TODAY));
    expect(orderGroup(task("a", "2026-10-01", 0), TODAY)).not.toBe(
      orderGroup(task("b", "2026-10-01", 1, true), TODAY),
    );
    expect(orderGroup(task("a", TODAY, 0), TODAY)).not.toBe(orderGroup(task("b", "2026-10-27", 1), TODAY));
  });
});

describe("productToday", () => {
  it("uses Israel time, so late evening UTC is already the next day", () => {
    expect(productToday(new Date("2026-10-26T22:30:00Z"))).toBe("2026-10-27");
    expect(productToday(new Date("2026-10-26T20:00:00Z"))).toBe("2026-10-26");
  });
});

describe("formatDueDate", () => {
  it("shows the date as DD/MM/YYYY", () => {
    expect(formatDueDate("2026-10-05")).toBe("05/10/2026");
  });
});
