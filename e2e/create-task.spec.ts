import type { Page } from "@playwright/test";
import type pg from "pg";
import { expect, test } from "./fixtures.js";
import { replaceTasks } from "../test-support/devSnapshot.js";

const FULL_MESSAGE = "הרשימה מלאה (1,000 משימות). כדי להוסיף משימה יש למחוק משימה קיימת.";

type StoredTask = { title: string | null; description: string | null; due_date: string | null; completed: boolean; position: number };

async function storedTasks(db: pg.Pool): Promise<StoredTask[]> {
  const { rows } = await db.query<StoredTask>(
    `select title, description, to_char(due_date, 'YYYY-MM-DD') as due_date, completed, position
       from public.tasks order by position, id`,
  );
  return rows;
}

function browserToday(page: Page): Promise<string> {
  return page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
}

async function openModal(page: Page) {
  await page.getByRole("button", { name: "הוסף משימה" }).click();
  const dialog = page.getByRole("dialog", { name: "הוספת משימה" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe("create task", () => {
  test("creates tasks with a title only, a description only, or both, with an optional date", async ({ page, db }) => {
    await replaceTasks(db, [{ title: "קיימת" }]);
    await page.goto("/");

    let dialog = await openModal(page);
    await dialog.getByLabel("כותרת").fill("רק כותרת");
    await dialog.getByLabel("תאריך יעד").fill("");
    await dialog.getByRole("button", { name: "הוסף משימה" }).click();
    await expect(dialog).toBeHidden();

    dialog = await openModal(page);
    await dialog.getByLabel("תיאור").fill("רק תיאור\nבשתי שורות");
    await dialog.getByRole("button", { name: "הוסף משימה" }).click();
    await expect(dialog).toBeHidden();

    dialog = await openModal(page);
    await dialog.getByLabel("כותרת").fill("שניהם");
    await dialog.getByLabel("תיאור").fill("עם תאריך עתידי");
    await dialog.getByLabel("תאריך יעד").fill("2031-03-15");
    await dialog.getByRole("button", { name: "הוסף משימה" }).click();
    await expect(dialog).toBeHidden();

    const today = await browserToday(page);
    await expect(page.getByTestId("task-row")).toHaveText(["קיימת", "רק כותרת", "רק תיאור בשתי שורות", "שניהם"]);
    expect(await storedTasks(db)).toEqual([
      { title: "קיימת", description: null, due_date: null, completed: false, position: 0 },
      { title: "רק כותרת", description: null, due_date: null, completed: false, position: 1 },
      { title: null, description: "רק תיאור\nבשתי שורות", due_date: today, completed: false, position: 2 },
      { title: "שניהם", description: "עם תאריך עתידי", due_date: "2031-03-15", completed: false, position: 3 },
    ]);
  });

  test("opens with empty fields and today's date, which can be cleared", async ({ page, db }) => {
    await replaceTasks(db, []);
    await page.goto("/");
    const dialog = await openModal(page);
    await expect(dialog.getByLabel("כותרת")).toHaveValue("");
    await expect(dialog.getByLabel("כותרת")).toHaveAttribute("placeholder", "הזן כותרת (לא חובה)");
    await expect(dialog.getByLabel("תיאור")).toHaveValue("");
    await expect(dialog.getByLabel("תיאור")).toHaveAttribute("placeholder", "הזן תיאור (לא חובה)");
    const date = dialog.getByLabel("תאריך יעד");
    await expect(date).toHaveAttribute("type", "date");
    await expect(date).toHaveValue(await browserToday(page));
    await date.fill("");
    await expect(date).toHaveValue("");
  });

  test("blocks invalid input with a message under the field", async ({ page, db }) => {
    await replaceTasks(db, []);
    await page.goto("/");
    let posts = 0;
    page.on("request", (r) => {
      if (r.method() === "POST" && r.url().includes("/api/tasks")) posts++;
    });
    const dialog = await openModal(page);
    const save = dialog.getByRole("button", { name: "הוסף משימה" });

    await dialog.getByLabel("כותרת").fill("   ");
    await dialog.getByLabel("תיאור").fill("  \n ");
    await save.click();
    await expect(dialog.getByText("יש להזין כותרת או תיאור למשימה")).toBeVisible();
    await expect(dialog.getByLabel("כותרת")).toHaveAttribute("aria-invalid", "true");
    await expect(dialog.getByLabel("תיאור")).toHaveAttribute("aria-invalid", "true");
    await expect(dialog.getByLabel("כותרת")).toHaveCSS("border-top-color", "rgb(235, 87, 87)");

    await dialog.getByLabel("כותרת").fill("א".repeat(101));
    await dialog.getByLabel("תיאור").fill("ב".repeat(2001));
    await dialog.getByLabel("תאריך יעד").fill("2020-01-01");
    await save.click();
    await expect(dialog.getByText("הכותרת יכולה להכיל עד 100 תווים")).toBeVisible();
    await expect(dialog.getByText("התיאור יכול להכיל עד 2,000 תווים")).toBeVisible();
    await expect(dialog.getByText("תאריך היעד לא יכול להיות בעבר")).toBeVisible();
    // The typed values are kept.
    await expect(dialog.getByLabel("כותרת")).toHaveValue("א".repeat(101));

    expect(posts).toBe(0);
    expect(await storedTasks(db)).toEqual([]);
  });

  test("a new task in a long list is selected, and it and its details are visible", async ({ page, db, isMobile }) => {
    await replaceTasks(db, Array.from({ length: 40 }, (_, i) => ({ title: `משימה ${i + 1}` })));
    await page.goto("/");
    const dialog = await openModal(page);
    await dialog.getByLabel("כותרת").fill("המשימה החדשה");
    await dialog.getByRole("button", { name: "הוסף משימה" }).click();
    await expect(dialog).toBeHidden();

    const rows = page.getByTestId("task-row");
    await expect(rows).toHaveCount(41);
    await expect(rows.last()).toHaveText("המשימה החדשה");
    await expect(rows.last()).toHaveClass(/is-selected/);
    const details = page.getByTestId("task-details");
    await expect(details.getByLabel("כותרת")).toHaveValue("המשימה החדשה");
    await expect(details).toBeInViewport();
    if (!isMobile) {
      await expect(rows.last()).toBeInViewport();
    }
  });

  test("when the list holds 1,000 tasks the button is unavailable and the API refuses", async ({ page, db, request }) => {
    await replaceTasks(db, Array.from({ length: 1000 }, (_, i) => ({ title: `משימה ${i + 1}` })));
    await page.goto("/");
    await expect(page.getByRole("button", { name: "הוסף משימה" })).toBeDisabled();
    await expect(page.getByText(FULL_MESSAGE)).toBeVisible();

    const response = await request.post("/api/tasks", { data: { title: "עוקפת את הממשק" } });
    expect(response.status()).toBe(409);
    expect((await response.json()).error.code).toBe("TASK_LIMIT_REACHED");
    expect((await storedTasks(db)).length).toBe(1000);
  });

  test("two parallel API requests cannot pass the limit", async ({ db, request }) => {
    await replaceTasks(db, Array.from({ length: 999 }, (_, i) => ({ title: `משימה ${i + 1}` })));
    const statuses = await Promise.all(
      ["מקבילה 1", "מקבילה 2"].map((title) => request.post("/api/tasks", { data: { title } }).then((r) => r.status())),
    );
    expect(statuses.sort()).toEqual([201, 409]);
    expect((await storedTasks(db)).length).toBe(1000);
  });

  test("closing without saving resets the form", async ({ page, db }) => {
    await replaceTasks(db, []);
    await page.goto("/");
    let dialog = await openModal(page);
    await dialog.getByLabel("כותרת").fill("טיוטה");
    await dialog.getByLabel("תאריך יעד").fill("");
    await dialog.getByRole("button", { name: "סגור" }).last().click();
    await expect(dialog).toBeHidden();

    dialog = await openModal(page);
    await expect(dialog.getByLabel("כותרת")).toHaveValue("");
    await expect(dialog.getByLabel("תאריך יעד")).toHaveValue(await browserToday(page));
    await dialog.getByLabel("תיאור").fill("עוד טיוטה");
    await dialog.getByRole("button", { name: "סגור" }).first().click();
    await expect(dialog).toBeHidden();

    dialog = await openModal(page);
    await expect(dialog.getByLabel("תיאור")).toHaveValue("");
    expect(await storedTasks(db)).toEqual([]);
  });

  test("a server error keeps the modal and the values, and a retry succeeds", async ({ page, db }) => {
    await replaceTasks(db, []);
    await page.goto("/");
    let failNext = true;
    await page.route("**/api/tasks", (route) => {
      if (route.request().method() === "POST" && failNext) {
        failNext = false;
        return route.fulfill({ status: 503, json: { error: { code: "DB_UNAVAILABLE", message: "x" } } });
      }
      return route.continue();
    });

    const dialog = await openModal(page);
    await dialog.getByLabel("כותרת").fill("ניסיון חוזר");
    await dialog.getByLabel("תיאור").fill("תיאור");
    await dialog.getByRole("button", { name: "הוסף משימה" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("השמירה נכשלה. נסה שוב.");
    await expect(dialog.getByLabel("כותרת")).toHaveValue("ניסיון חוזר");
    await expect(dialog.getByLabel("תיאור")).toHaveValue("תיאור");
    expect(await storedTasks(db)).toEqual([]);

    await dialog.getByRole("button", { name: "הוסף משימה" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("task-row")).toHaveText(["ניסיון חוזר"]);
    expect((await storedTasks(db)).length).toBe(1);
  });

  test("a saved task survives a refresh and is seen from another window", async ({ page, db, browser }) => {
    await replaceTasks(db, []);
    await page.goto("/");
    const dialog = await openModal(page);
    await dialog.getByLabel("כותרת").fill("משותפת");
    await dialog.getByRole("button", { name: "הוסף משימה" }).click();
    await expect(dialog).toBeHidden();

    await page.reload();
    await expect(page.getByTestId("task-row")).toHaveText(["משותפת"]);

    const other = await browser.newContext();
    try {
      const otherPage = await other.newPage();
      await otherPage.goto("/");
      await expect(otherPage.getByTestId("task-row")).toHaveText(["משותפת"]);
    } finally {
      await other.close();
    }
  });
});
