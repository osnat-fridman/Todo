import type { Page } from "@playwright/test";
import type pg from "pg";
import { expect, test } from "./fixtures.js";
import { replaceTasks } from "../test-support/devSnapshot.js";

const GONE = "המשימה כבר לא קיימת. ייתכן שנמחקה על ידי מבקר אחר.";
const CONFLICT = "הרשימה השתנתה בינתיים. רענן את הרשימה ונסה שוב.";

type StoredTask = { title: string | null; completed: boolean; position: number };

async function storedTasks(db: pg.Pool): Promise<StoredTask[]> {
  const { rows } = await db.query<StoredTask>(
    "select title, completed, position from public.tasks order by position, id",
  );
  return rows;
}

function rows(page: Page) {
  return page.getByTestId("task-row");
}

function checkbox(page: Page, label: string) {
  return page.getByRole("checkbox", { name: new RegExp(`: ${label}$`) });
}

function handle(page: Page, label: string) {
  return page.getByRole("button", { name: `גרור כדי לשנות את מיקום המשימה: ${label}` });
}

async function select(page: Page, name: string) {
  await page.getByRole("button", { name, exact: true }).click();
  const details = page.getByTestId("task-details");
  await expect(details.getByLabel("כותרת")).toBeVisible();
  return details;
}

/** Centre of the source handle and of the target row, after bringing the list into view. */
async function dragPoints(page: Page, from: string, to: string) {
  await handle(page, from).scrollIntoViewIfNeeded();
  const start = (await handle(page, from).boundingBox())!;
  const end = (await rows(page).filter({ hasText: new RegExp(`^${to}$`) }).boundingBox())!;
  return {
    x: start.x + start.width / 2,
    y: start.y + start.height / 2,
    endY: end.y + end.height / 2,
  };
}

/** Drags a task by its handle onto another task's place, with the mouse (pointer events). */
async function dragWithMouse(page: Page, from: string, to: string) {
  const { x, y, endY } = await dragPoints(page, from, to);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + Math.sign(endY - y) * 10, { steps: 2 });
  await page.mouse.move(x, endY, { steps: 10 });
  await page.mouse.up();
}

/** Drags with real touch events (Chromium only, through the DevTools protocol). */
async function dragWithTouch(page: Page, from: string, to: string) {
  const { x, y, endY } = await dragPoints(page, from, to);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let step = 1; step <= 10; step++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y: y + ((endY - y) * step) / 10 }],
    });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

test.describe("status", () => {
  test("the checkbox marks and unmarks a task, saved at once and kept in place", async ({ page, db }) => {
    await replaceTasks(db, [{ title: "א" }, { title: "ב" }, { title: "ג" }]);
    await page.goto("/");

    await checkbox(page, "ב").check();
    await expect(rows(page).nth(1)).toHaveClass(/is-completed/);
    await expect(rows(page).nth(1).locator(".task-row-text")).toHaveCSS("text-decoration-line", "line-through");
    await expect.poll(() => storedTasks(db)).toEqual([
      { title: "א", completed: false, position: 0 },
      { title: "ב", completed: true, position: 1 },
      { title: "ג", completed: false, position: 2 },
    ]);
    // Checking does not select the task.
    await expect(page.getByRole("button", { name: "ב", exact: true })).toHaveAttribute("aria-pressed", "false");

    await page.reload();
    await expect(checkbox(page, "ב")).toBeChecked();
    await checkbox(page, "ב").uncheck();
    await expect.poll(async () => (await storedTasks(db))[1].completed).toBe(false);
    await expect(rows(page)).toHaveText(["א", "ב", "ג"]);
  });

  test("checking the selected task keeps its unsaved edit", async ({ page, db }) => {
    await replaceTasks(db, [{ title: "נבחרת" }]);
    await page.goto("/");
    const details = await select(page, "נבחרת");
    await details.getByLabel("תיאור").fill("טיוטה שלא נשמרה");

    await checkbox(page, "נבחרת").check();
    await expect.poll(async () => (await storedTasks(db))[0].completed).toBe(true);
    await expect(details.getByLabel("תיאור")).toHaveValue("טיוטה שלא נשמרה");
    const { rows: stored } = await db.query("select description from public.tasks");
    expect(stored[0].description).toBeNull();
  });

  test("a server error puts the checkbox back and says so", async ({ page, db }) => {
    await replaceTasks(db, [{ title: "משימה" }]);
    await page.goto("/");
    await page.route("**/api/tasks/*/status", (route) =>
      route.fulfill({ status: 503, json: { error: { code: "DB_UNAVAILABLE", message: "x" } } }),
    );
    await checkbox(page, "משימה").click();
    await expect(page.getByText("שינוי הסטטוס נכשל. נסה שוב.")).toBeVisible();
    await expect(checkbox(page, "משימה")).not.toBeChecked();
    expect((await storedTasks(db))[0].completed).toBe(false);
  });

  test("checking a task deleted in another window removes it and says so", async ({ page, db }) => {
    await replaceTasks(db, [{ title: "תימחק" }, { title: "נשארת" }]);
    await page.goto("/");
    await expect(rows(page)).toHaveText(["תימחק", "נשארת"]);
    await db.query("delete from public.tasks where title = 'תימחק'");
    await checkbox(page, "תימחק").click();
    await expect(page.getByText(GONE)).toBeVisible();
    await expect(rows(page)).toHaveText(["נשארת"]);
  });
});

test.describe("order", () => {
  test("the handle has touch settings that keep the browser from scrolling, selecting or opening menus", async ({ page, db }) => {
    await replaceTasks(db, [{ title: "א" }]);
    await page.goto("/");
    await expect(handle(page, "א")).toHaveCSS("touch-action", "none");
    await expect(handle(page, "א")).toHaveCSS("user-select", "none");
  });

  test("dragging with the mouse saves the exact order, also for a completed task", async ({ page, db }) => {
    await replaceTasks(db, [{ title: "א" }, { title: "ב", completed: true }, { title: "ג" }]);
    await page.goto("/");

    await dragWithMouse(page, "ב", "ג");
    await expect(rows(page)).toHaveText(["א", "ג", "ב"]);
    await expect.poll(() => storedTasks(db)).toEqual([
      { title: "א", completed: false, position: 0 },
      { title: "ג", completed: false, position: 1 },
      { title: "ב", completed: true, position: 2 },
    ]);
    // The drag neither selected a task nor changed a checkbox.
    await expect(page.locator(".task-row.is-selected")).toHaveCount(0);
    await expect(checkbox(page, "ב")).toBeChecked();
    await expect(checkbox(page, "ג")).not.toBeChecked();

    await dragWithMouse(page, "ג", "א");
    await expect(rows(page)).toHaveText(["ג", "א", "ב"]);
    await expect.poll(async () => (await storedTasks(db)).map((t) => t.title)).toEqual(["ג", "א", "ב"]);

    await page.reload();
    await expect(rows(page)).toHaveText(["ג", "א", "ב"]);
    expect((await storedTasks(db)).map((t) => t.position)).toEqual([0, 1, 2]);
  });

  test("dragging with touch saves the order", async ({ page, db }, testInfo) => {
    test.skip(testInfo.project.name !== "Mobile Chrome", "Real touch events need Chromium's DevTools protocol.");
    await replaceTasks(db, [{ title: "א" }, { title: "ב" }, { title: "ג" }]);
    await page.goto("/");

    await dragWithTouch(page, "א", "ג");
    await expect(rows(page)).toHaveText(["ב", "ג", "א"]);
    await expect.poll(async () => (await storedTasks(db)).map((t) => t.title)).toEqual(["ב", "ג", "א"]);
    await expect(page.locator(".task-row.is-selected")).toHaveCount(0);
    await expect(checkbox(page, "א")).not.toBeChecked();
  });

  test("dragging the selected task keeps it selected with its unsaved edit", async ({ page, db }) => {
    await replaceTasks(db, [{ title: "א" }, { title: "ב" }]);
    await page.goto("/");
    const details = await select(page, "א");
    await details.getByLabel("כותרת").fill("א בעריכה");

    await dragWithMouse(page, "א", "ב");
    await expect(rows(page)).toHaveText(["ב", "א"]);
    await expect.poll(async () => (await storedTasks(db)).map((t) => t.title)).toEqual(["ב", "א"]);
    await expect(details.getByLabel("כותרת")).toHaveValue("א בעריכה");
    await expect(page.getByRole("button", { name: "א", exact: true })).toHaveAttribute("aria-pressed", "true");
  });

  test("a server error puts the previous order back and says so", async ({ page, db }) => {
    await replaceTasks(db, [{ title: "א" }, { title: "ב" }]);
    await page.goto("/");
    await page.route("**/api/tasks/order", (route) =>
      route.fulfill({ status: 503, json: { error: { code: "DB_UNAVAILABLE", message: "x" } } }),
    );
    await dragWithMouse(page, "א", "ב");
    await expect(page.getByText("שמירת הסדר נכשלה, והסדר הקודם הוחזר.")).toBeVisible();
    await expect(rows(page)).toHaveText(["א", "ב"]);
    expect((await storedTasks(db)).map((t) => t.title)).toEqual(["א", "ב"]);
  });

  test("a list changed by another visitor is not overwritten, and can be reloaded", async ({ page, db }) => {
    await replaceTasks(db, [{ title: "א" }, { title: "ב" }]);
    await page.goto("/");
    await expect(rows(page)).toHaveText(["א", "ב"]);
    await db.query("insert into public.tasks (title, position) values ('של מבקר אחר', 2)");

    await dragWithMouse(page, "א", "ב");
    await expect(page.getByText(CONFLICT)).toBeVisible();
    await expect(rows(page)).toHaveText(["א", "ב"]);
    expect((await storedTasks(db)).map((t) => t.title)).toEqual(["א", "ב", "של מבקר אחר"]);

    await page.getByRole("button", { name: "רענן את הרשימה" }).click();
    await expect(rows(page)).toHaveText(["א", "ב", "של מבקר אחר"]);
    await expect(page.getByText(CONFLICT)).toBeHidden();

    await dragWithMouse(page, "של מבקר אחר", "א");
    await expect.poll(async () => (await storedTasks(db)).map((t) => t.title)).toEqual(["של מבקר אחר", "א", "ב"]);
  });
});
