import type { Page } from "@playwright/test";
import type pg from "pg";
import { expect, test } from "./fixtures.js";
import { replaceTasks } from "../test-support/devSnapshot.js";

const OFFLINE_NOTICE = "אין חיבור לאינטרנט. לא ניתן לצפות במשימות או לשנות אותן עד שהחיבור יחזור.";
const OFFLINE_ACTION = "אין חיבור לאינטרנט. הפעולה לא בוצעה.";

type StoredTask = { title: string | null; description: string | null; completed: boolean; position: number };

async function storedTasks(db: pg.Pool): Promise<StoredTask[]> {
  const { rows } = await db.query<StoredTask>(
    "select title, description, completed, position from public.tasks order by position, id",
  );
  return rows;
}

function rows(page: Page) {
  return page.getByTestId("task-row");
}

/** Drags a task by its handle onto another task's place, with the mouse. */
async function dragWithMouse(page: Page, from: string, to: string) {
  const handle = page.getByRole("button", { name: `גרור כדי לשנות את מיקום המשימה: ${from}` });
  await handle.scrollIntoViewIfNeeded();
  const start = (await handle.boundingBox())!;
  const end = (await rows(page).filter({ hasText: new RegExp(`^${to}$`) }).boundingBox())!;
  const x = start.x + start.width / 2;
  const y = start.y + start.height / 2;
  const endY = end.y + end.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + Math.sign(endY - y) * 10, { steps: 2 });
  await page.mouse.move(x, endY, { steps: 10 });
  await page.mouse.up();
}

test.describe("no connection", () => {
  test("a fixed notice appears on both pages while offline and goes away when back online", async ({ page, context }) => {
    await page.goto("/");
    await expect(page.getByText(OFFLINE_NOTICE)).toHaveCount(0);

    await context.setOffline(true);
    await expect(page.getByText(OFFLINE_NOTICE)).toBeVisible();
    await page.getByRole("link", { name: "אודות" }).click();
    await expect(page.getByText(OFFLINE_NOTICE)).toBeVisible();

    await context.setOffline(false);
    await expect(page.getByText(OFFLINE_NOTICE)).toHaveCount(0);
  });

  test("no change is made while offline, and the database stays as it was", async ({ page, context, db }) => {
    await replaceTasks(db, [{ title: "א" }, { title: "ב" }, { title: "ג" }]);
    const before = await storedTasks(db);
    await page.goto("/");
    await expect(rows(page)).toHaveText(["א", "ב", "ג"]);
    await context.setOffline(true);

    // Create: the modal and its values stay.
    await page.getByRole("button", { name: "הוסף משימה" }).click();
    const dialog = page.getByRole("dialog", { name: "הוספת משימה" });
    await dialog.getByLabel("כותרת").fill("חדשה");
    await dialog.getByRole("button", { name: "הוסף משימה" }).click();
    await expect(dialog.getByText(OFFLINE_ACTION)).toBeVisible();
    await expect(dialog.getByLabel("כותרת")).toHaveValue("חדשה");
    await dialog.getByRole("button", { name: "סגור" }).last().click();

    // Edit: the draft stays.
    await page.getByRole("button", { name: "א", exact: true }).click();
    const details = page.getByTestId("task-details");
    await details.getByLabel("כותרת").fill("א ערוכה");
    await details.getByRole("button", { name: "שמור שינויים" }).click();
    await expect(details.getByText(OFFLINE_ACTION)).toBeVisible();
    await expect(details.getByLabel("כותרת")).toHaveValue("א ערוכה");

    // Checkbox: goes back.
    const checkbox = page.getByRole("checkbox", { name: /: ב$/ });
    await checkbox.click();
    await expect(page.getByRole("region", { name: "רשימת משימות" }).getByText(OFFLINE_ACTION)).toBeVisible();
    await expect(checkbox).not.toBeChecked();

    // Delete: the task stays.
    await details.getByRole("button", { name: "מחק משימה" }).click();
    const confirm = page.getByRole("alertdialog", { name: "מחיקת משימה" });
    await confirm.getByRole("button", { name: "אישור" }).click();
    await expect(confirm.getByText(OFFLINE_ACTION)).toBeVisible();
    await confirm.getByRole("button", { name: "ביטול" }).click();
    await expect(rows(page)).toHaveText(["א", "ב", "ג"]);

    // Drag: the order goes back.
    await dragWithMouse(page, "ג", "ב");
    await expect(rows(page)).toHaveText(["א", "ב", "ג"]);

    await context.setOffline(false);
    expect(await storedTasks(db)).toEqual(before);
    await page.reload();
    await expect(rows(page)).toHaveText(["א", "ב", "ג"]);
  });

  test("a refresh while offline shows no saved task list", async ({ page, context, db }) => {
    await replaceTasks(db, [{ title: "שמורה בשרת" }]);
    await page.goto("/");
    await expect(rows(page)).toHaveText(["שמורה בשרת"]);

    await context.setOffline(true);
    await page.reload().catch(() => undefined);
    // Chrome shows its "no internet" page. WebKit may keep the page that was already open when the
    // reload fails; then the offline notice says the list cannot be viewed. Nothing is loaded from a cache.
    if ((await rows(page).count()) > 0) {
      await expect(page.getByText(OFFLINE_NOTICE)).toBeVisible();
    } else {
      await expect(page.getByText("שמורה בשרת")).toHaveCount(0);
    }

    await context.setOffline(false);
    await page.goto("/");
    await expect(rows(page)).toHaveText(["שמורה בשרת"]);
  });
});
