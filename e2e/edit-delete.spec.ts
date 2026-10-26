import type { Page } from "@playwright/test";
import type pg from "pg";
import { expect, test } from "./fixtures.js";
import { replaceTasks } from "../test-support/devSnapshot.js";

const GONE = "המשימה כבר לא קיימת. ייתכן שנמחקה על ידי מבקר אחר.";
const NO_SELECTION = "בחר משימה מהרשימה כדי לצפות בפרטיה";

type StoredTask = { title: string | null; description: string | null; due_date: string | null; completed: boolean; position: number };

async function storedTasks(db: pg.Pool): Promise<StoredTask[]> {
  const { rows } = await db.query<StoredTask>(
    `select title, description, to_char(due_date, 'YYYY-MM-DD') as due_date, completed, position
       from public.tasks order by position, id`,
  );
  return rows;
}

async function select(page: Page, name: string) {
  await page.getByRole("button", { name, exact: true }).click();
  const details = page.getByTestId("task-details");
  await expect(details.getByLabel("כותרת")).toBeVisible();
  return details;
}

async function openDeleteConfirm(page: Page, name: string) {
  const details = await select(page, name);
  await details.getByRole("button", { name: "מחק משימה" }).click();
  const dialog = page.getByRole("alertdialog", { name: "מחיקת משימה" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe("edit task details", () => {
  test("edited details are saved and still there after a refresh", async ({ page, db }) => {
    await replaceTasks(db, [{ title: "לפני", description: "תיאור ישן", completed: true }, { title: "אחרת" }]);
    await page.goto("/");
    const details = await select(page, "לפני");
    await details.getByLabel("כותרת").fill("אחרי");
    await details.getByLabel("תיאור").fill("תיאור חדש\nבשתי שורות");
    await details.getByLabel("תאריך יעד").fill("2031-07-01");
    await details.getByRole("button", { name: "שמור שינויים" }).click();

    await expect(page.getByTestId("task-row").first()).toHaveText("אחרי");
    await expect.poll(() => storedTasks(db)).toEqual([
      { title: "אחרי", description: "תיאור חדש\nבשתי שורות", due_date: "2031-07-01", completed: true, position: 0 },
      { title: "אחרת", description: null, due_date: null, completed: false, position: 1 },
    ]);

    await page.reload();
    const reloaded = await select(page, "אחרי");
    await expect(reloaded.getByLabel("תיאור")).toHaveValue("תיאור חדש\nבשתי שורות");
    await expect(reloaded.getByLabel("תאריך יעד")).toHaveValue("2031-07-01");
  });

  test("a past saved date can be kept, but not changed to another past date", async ({ page, db }) => {
    await replaceTasks(db, [{ title: "ישנה", dueDate: "2020-05-05" }]);
    await page.goto("/");
    // An open task with a past date is overdue, so its row also says so (PRD FR-11).
    const details = await select(page, "ישנה באיחור: 05/05/2020");
    await details.getByLabel("כותרת").fill("ישנה ומעודכנת");
    await details.getByRole("button", { name: "שמור שינויים" }).click();
    await expect(page.getByTestId("task-row")).toHaveText(["ישנה ומעודכנתבאיחור: 05/05/2020"]);
    await expect.poll(async () => (await storedTasks(db))[0]).toMatchObject({ title: "ישנה ומעודכנת", due_date: "2020-05-05" });

    await details.getByLabel("תאריך יעד").fill("2020-05-06");
    await details.getByRole("button", { name: "שמור שינויים" }).click();
    await expect(details.getByText("תאריך היעד לא יכול להיות בעבר")).toBeVisible();
    await expect(details.getByLabel("תאריך יעד")).toHaveCSS("border-top-color", "rgb(235, 87, 87)");
    expect((await storedTasks(db))[0].due_date).toBe("2020-05-05");
  });

  test("invalid input shows a message under the field and keeps the edit", async ({ page, db }) => {
    await replaceTasks(db, [{ title: "משימה" }]);
    await page.goto("/");
    const details = await select(page, "משימה");
    await details.getByLabel("כותרת").fill("א".repeat(101));
    await details.getByRole("button", { name: "שמור שינויים" }).click();
    await expect(details.getByText("הכותרת יכולה להכיל עד 100 תווים")).toBeVisible();
    await expect(details.getByLabel("כותרת")).toHaveValue("א".repeat(101));
    expect((await storedTasks(db))[0].title).toBe("משימה");
  });

  test("unsaved changes are dropped by choosing another task, visiting About, or refreshing", async ({ page, db }) => {
    await replaceTasks(db, [{ title: "ראשונה" }, { title: "שנייה" }]);
    await page.goto("/");

    let details = await select(page, "ראשונה");
    await details.getByLabel("כותרת").fill("טיוטה 1");
    await select(page, "שנייה");
    details = await select(page, "ראשונה");
    await expect(details.getByLabel("כותרת")).toHaveValue("ראשונה");

    await details.getByLabel("כותרת").fill("טיוטה 2");
    await page.getByRole("link", { name: "אודות" }).click();
    await page.getByRole("link", { name: "דף הבית" }).click();
    details = await select(page, "ראשונה");
    await expect(details.getByLabel("כותרת")).toHaveValue("ראשונה");

    await details.getByLabel("כותרת").fill("טיוטה 3");
    await page.reload();
    details = await select(page, "ראשונה");
    await expect(details.getByLabel("כותרת")).toHaveValue("ראשונה");

    expect((await storedTasks(db)).map((t) => t.title)).toEqual(["ראשונה", "שנייה"]);
  });

  test("a server error keeps the edit and a retry succeeds", async ({ page, db }) => {
    await replaceTasks(db, [{ title: "משימה" }]);
    await page.goto("/");
    let failNext = true;
    await page.route("**/api/tasks/*", (route) => {
      if (route.request().method() === "PATCH" && failNext) {
        failNext = false;
        return route.fulfill({ status: 503, json: { error: { code: "DB_UNAVAILABLE", message: "x" } } });
      }
      return route.continue();
    });
    const details = await select(page, "משימה");
    await details.getByLabel("כותרת").fill("ניסיון חוזר");
    await details.getByRole("button", { name: "שמור שינויים" }).click();
    await expect(details.getByRole("alert")).toHaveText("השמירה נכשלה. נסה שוב.");
    await expect(details.getByLabel("כותרת")).toHaveValue("ניסיון חוזר");
    expect((await storedTasks(db))[0].title).toBe("משימה");

    await details.getByRole("button", { name: "שמור שינויים" }).click();
    await expect(details.getByRole("alert")).toBeHidden();
    await expect.poll(async () => (await storedTasks(db))[0].title).toBe("ניסיון חוזר");
  });

  test("saving a task deleted in another window removes it and says so", async ({ page, db }) => {
    await replaceTasks(db, [{ title: "תימחק" }, { title: "נשארת" }]);
    await page.goto("/");
    const details = await select(page, "תימחק");
    await db.query("delete from public.tasks where title = 'תימחק'");
    await details.getByLabel("כותרת").fill("שינוי");
    await details.getByRole("button", { name: "שמור שינויים" }).click();
    await expect(details.getByRole("alert")).toHaveText(GONE);
    await expect(details.getByText(NO_SELECTION)).toBeVisible();
    await expect(page.getByTestId("task-row")).toHaveText(["נשארת"]);
  });
});

test.describe("delete task", () => {
  test("cancel keeps the task; confirm deletes it and resets the details", async ({ page, db }) => {
    await replaceTasks(db, [{ title: "א" }, { title: "ב" }, { title: "ג" }]);
    await page.goto("/");

    let dialog = await openDeleteConfirm(page, "ב");
    await expect(dialog.getByText("האם אתה בטוח שברצונך למחוק את המשימה הזו?")).toBeVisible();
    await dialog.getByRole("button", { name: "ביטול" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("task-row")).toHaveCount(3);
    expect(await storedTasks(db)).toHaveLength(3);

    dialog = await openDeleteConfirm(page, "ב");
    await dialog.getByRole("button", { name: "אישור" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("task-row")).toHaveText(["א", "ג"]);
    await expect(page.getByTestId("task-details").getByText(NO_SELECTION)).toBeVisible();
    expect((await storedTasks(db)).map((t) => [t.title, t.position])).toEqual([
      ["א", 0],
      ["ג", 1],
    ]);

    await page.reload();
    await expect(page.getByTestId("task-row")).toHaveText(["א", "ג"]);
  });

  test("a failed delete keeps the task on screen and in the database", async ({ page, db }) => {
    await replaceTasks(db, [{ title: "משימה" }]);
    await page.goto("/");
    await page.route("**/api/tasks/*", (route) =>
      route.request().method() === "DELETE"
        ? route.fulfill({ status: 503, json: { error: { code: "DB_UNAVAILABLE", message: "x" } } })
        : route.continue(),
    );
    const dialog = await openDeleteConfirm(page, "משימה");
    await dialog.getByRole("button", { name: "אישור" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("המחיקה נכשלה. נסה שוב.");
    await dialog.getByRole("button", { name: "ביטול" }).click();
    await expect(page.getByTestId("task-row")).toHaveText(["משימה"]);
    await expect(page.getByTestId("task-details").getByLabel("כותרת")).toHaveValue("משימה");
    expect(await storedTasks(db)).toHaveLength(1);
  });

  test("deleting a task deleted in another window removes it and says so", async ({ page, db }) => {
    await replaceTasks(db, [{ title: "תימחק" }, { title: "נשארת" }]);
    await page.goto("/");
    const dialog = await openDeleteConfirm(page, "תימחק");
    await db.query("delete from public.tasks where title = 'תימחק'");
    await dialog.getByRole("button", { name: "אישור" }).click();
    await expect(dialog).toBeHidden();
    const details = page.getByTestId("task-details");
    await expect(details.getByRole("alert")).toHaveText(GONE);
    await expect(details.getByText(NO_SELECTION)).toBeVisible();
    await expect(page.getByTestId("task-row")).toHaveText(["נשארת"]);
  });
});
