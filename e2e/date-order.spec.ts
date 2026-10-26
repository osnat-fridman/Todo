import type { Page } from "@playwright/test";
import type pg from "pg";
import { expect, test } from "./fixtures.js";
import { replaceTasks } from "../test-support/devSnapshot.js";

const OUTSIDE_GROUP = "אפשר להזיז משימה רק בין משימות עם אותו תאריך יעד.";

// Fixed dates far from today, so the test does not depend on the day it runs.
const SAMPLE = [
  { title: "בלי תאריך" },
  { title: "שנה הבאה ב", dueDate: "2099-01-01" },
  { title: "באיחור", dueDate: "2020-01-01" },
  { title: "שנה הבאה א", dueDate: "2099-01-01" },
  { title: "הושלמה בעבר", dueDate: "2020-01-01", completed: true },
  { title: "רחוקה", dueDate: "2099-12-31" },
];

const SORTED = ["באיחור", "הושלמה בעבר", "שנה הבאה ב", "שנה הבאה א", "רחוקה", "בלי תאריך"];

function rows(page: Page) {
  return page.getByTestId("task-row");
}

function titles(page: Page) {
  return page.locator(".task-row-text");
}

async function storedTitles(db: pg.Pool): Promise<string[]> {
  const { rows } = await db.query<{ title: string }>("select title from public.tasks order by position, id");
  return rows.map((row) => row.title);
}

function row(page: Page, title: string) {
  return rows(page).filter({ has: page.locator(".task-row-text", { hasText: new RegExp(`^${title}$`) }) });
}

/** Drags a task by its handle onto another task's place, with the mouse. */
async function dragWithMouse(page: Page, from: string, to: string) {
  const handle = page.getByRole("button", { name: `גרור כדי לשנות את מיקום המשימה: ${from}` });
  await handle.scrollIntoViewIfNeeded();
  const start = (await handle.boundingBox())!;
  const end = (await row(page, to).boundingBox())!;
  const x = start.x + start.width / 2;
  const y = start.y + start.height / 2;
  const endY = end.y + end.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + Math.sign(endY - y) * 10, { steps: 2 });
  await page.mouse.move(x, endY, { steps: 10 });
  await page.mouse.up();
}

test.describe("order by due date", () => {
  test("shows overdue first and marked, then nearest date, then no date – also after a refresh", async ({ page, db }) => {
    await replaceTasks(db, SAMPLE);
    await page.goto("/");
    await expect(titles(page)).toHaveText(SORTED);

    const overdue = row(page, "באיחור");
    await expect(overdue).toHaveClass(/is-overdue/);
    await expect(overdue.locator(".task-row-overdue")).toHaveText("באיחור: 01/01/2020");
    await expect(overdue).toHaveCSS("background-color", "rgb(253, 236, 236)");
    await expect(overdue.locator(".task-row-overdue")).toHaveCSS("color", "rgb(198, 40, 40)");
    await expect(page.locator(".task-row.is-overdue")).toHaveCount(1);

    await page.reload();
    await expect(titles(page)).toHaveText(SORTED);
  });

  test("a new task goes to the place of its due date, and one without a date to the end", async ({ page, db }) => {
    await replaceTasks(db, SAMPLE);
    await page.goto("/");

    await page.getByRole("button", { name: "הוסף משימה" }).click();
    let dialog = page.getByRole("dialog", { name: "הוספת משימה" });
    await dialog.getByLabel("כותרת").fill("באמצע השנה");
    await dialog.getByLabel("תאריך יעד").fill("2099-06-01");
    await dialog.getByRole("button", { name: "הוסף משימה" }).click();
    await expect(dialog).toBeHidden();
    await expect(titles(page)).toHaveText([...SORTED.slice(0, 4), "באמצע השנה", ...SORTED.slice(4)]);
    await expect(row(page, "באמצע השנה")).toHaveClass(/is-selected/);

    await page.getByRole("button", { name: "הוסף משימה" }).click();
    dialog = page.getByRole("dialog", { name: "הוספת משימה" });
    await dialog.getByLabel("כותרת").fill("גם בלי תאריך");
    await dialog.getByLabel("תאריך יעד").fill("");
    await dialog.getByRole("button", { name: "הוסף משימה" }).click();
    await expect(dialog).toBeHidden();
    await expect(titles(page).last()).toHaveText("גם בלי תאריך");
  });

  test("saving a new due date moves the task, and it stays selected", async ({ page, db }) => {
    await replaceTasks(db, SAMPLE);
    await page.goto("/");
    await page.getByRole("button", { name: "בלי תאריך", exact: true }).click();
    const details = page.getByTestId("task-details");
    await details.getByLabel("תאריך יעד").fill("2099-01-01");
    await details.getByRole("button", { name: "שמור שינויים" }).click();

    // It joins the tasks of that date after them, by its stored manual order (position 0 comes first).
    await expect(titles(page)).toHaveText(["באיחור", "הושלמה בעבר", "בלי תאריך", "שנה הבאה ב", "שנה הבאה א", "רחוקה"]);
    await expect(row(page, "בלי תאריך")).toHaveClass(/is-selected/);
  });

  test("completing an overdue task removes the mark; reopening brings it back to the top", async ({ page, db }) => {
    await replaceTasks(db, SAMPLE);
    await page.goto("/");
    const box = page.getByRole("checkbox", { name: /: באיחור$/ });

    await box.click();
    await expect(box).toBeChecked();
    await expect(page.locator(".task-row.is-overdue")).toHaveCount(0);

    await box.click();
    await expect(box).not.toBeChecked();
    await expect(rows(page).first()).toHaveClass(/is-overdue/);
    await expect(titles(page).first()).toHaveText("באיחור");
  });

  test("dragging among tasks of the same date saves; onto another date it goes back unsaved", async ({ page, db }) => {
    await replaceTasks(db, SAMPLE);
    await page.goto("/");
    let saves = 0;
    page.on("request", (request) => {
      if (request.url().endsWith("/api/tasks/order")) saves += 1;
    });

    await dragWithMouse(page, "שנה הבאה א", "רחוקה");
    await expect(page.getByRole("alert").filter({ hasText: OUTSIDE_GROUP })).toBeVisible();
    await expect(titles(page)).toHaveText(SORTED);
    expect(saves).toBe(0);

    await dragWithMouse(page, "שנה הבאה א", "שנה הבאה ב");
    const reordered = ["באיחור", "הושלמה בעבר", "שנה הבאה א", "שנה הבאה ב", "רחוקה", "בלי תאריך"];
    await expect(titles(page)).toHaveText(reordered);
    await expect(page.getByRole("alert").filter({ hasText: OUTSIDE_GROUP })).toBeHidden();
    await expect.poll(() => storedTitles(db)).toEqual(reordered);

    await page.reload();
    await expect(titles(page)).toHaveText(reordered);
  });
});
