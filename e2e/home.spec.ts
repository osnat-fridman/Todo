import { expect, test } from "./fixtures.js";
import { replaceTasks } from "../test-support/devSnapshot.js";

const LONG_DESCRIPTION =
  "לבדוק אפשרויות ביטוח לרכב לפני חידוש הפוליסה בחודש הבא,\nכולל השוואה בין לפחות שלוש חברות ביטוח שונות ובדיקת כיסוי לשמשות וגרירה ועוד פרטים רבים.";

const SAMPLE = [
  { title: "לקנות מצרכים", description: "חלב ולחם", dueDate: "2030-01-15" },
  { title: null, description: LONG_DESCRIPTION },
  { title: "לסיים דוח שנתי", completed: true },
  { title: "לפנות למוסך" },
  { title: "משימה 5" },
  { title: "משימה 6" },
  { title: "משימה 7" },
  { title: "משימה 8" },
  { title: "משימה 9" },
  { title: "משימה 10" },
];

test.describe("home page", () => {
  test("shows the shared list from the database, in the saved order", async ({ page, db }) => {
    await replaceTasks(db, SAMPLE);
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("רשימת המשימות");
    const rows = page.getByTestId("task-row");
    await expect(rows).toHaveCount(SAMPLE.length);
    await expect(rows.nth(0)).toHaveText("לקנות מצרכים");
    await expect(rows.nth(3)).toHaveText("לפנות למוסך");

    // Without a title, the start of the description is shown on a single line, cut with an ellipsis.
    const text = rows.nth(1).locator(".task-row-text");
    await expect(text).toContainText("לבדוק אפשרויות ביטוח לרכב");
    const box = await text.evaluate((el) => ({
      clipped: el.scrollWidth > el.clientWidth,
      ellipsis: getComputedStyle(el).textOverflow,
      lines: Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)),
    }));
    expect(box).toEqual({ clipped: true, ellipsis: "ellipsis", lines: 1 });

    // A completed task is marked: checked box and struck-through text.
    await expect(rows.nth(2).getByRole("checkbox")).toBeChecked();
    await expect(rows.nth(2).locator(".task-row-text")).toHaveCSS("text-decoration-line", "line-through");
    await expect(rows.nth(0).getByRole("checkbox")).not.toBeChecked();
  });

  test("starts with no selection and shows the selected task's details", async ({ page, db, isMobile }) => {
    await replaceTasks(db, SAMPLE);
    await page.goto("/");
    const details = page.getByTestId("task-details");
    await expect(details).toContainText("בחר משימה מהרשימה כדי לצפות בפרטיה");

    await page.getByRole("button", { name: "לקנות מצרכים" }).click();
    await expect(details.getByLabel("כותרת")).toHaveValue("לקנות מצרכים");
    await expect(details.getByLabel("תיאור")).toHaveValue("חלב ולחם");
    await expect(details.getByLabel("תאריך יעד")).toHaveValue("2030-01-15");
    await expect(page.getByTestId("task-row").first()).toHaveClass(/is-selected/);

    if (isMobile) {
      // The details area is below the list on mobile, so selecting scrolls to it.
      await expect(details).toBeInViewport();
    }
  });

  test("details are beside the list on desktop and below it on mobile", async ({ page, db, isMobile }) => {
    await replaceTasks(db, SAMPLE.slice(0, 3));
    await page.goto("/");
    const list = await page.locator(".task-list-card").boundingBox();
    const details = await page.getByTestId("task-details").boundingBox();
    expect(list && details).toBeTruthy();
    if (isMobile) {
      expect(details!.y).toBeGreaterThanOrEqual(list!.y + list!.height);
    } else {
      // RTL: list on the right, details on the left, side by side.
      expect(list!.x).toBeGreaterThan(details!.x);
      expect(Math.abs(list!.y - details!.y)).toBeLessThan(2);
    }
  });

  test("shows the empty-list message when there are no tasks", async ({ page, db }) => {
    await replaceTasks(db, []);
    await page.goto("/");
    await expect(page.getByText(/אין עדיין משימות ברשימה/)).toBeVisible();
    await expect(page.getByTestId("task-details")).toContainText("בחר משימה מהרשימה כדי לצפות בפרטיה");
  });

  test("shows a load error, not an empty list, when the server fails", async ({ page }) => {
    await page.route("**/api/tasks", (route) =>
      route.fulfill({ status: 503, json: { error: { code: "DB_UNAVAILABLE", message: "x" } } }),
    );
    await page.goto("/");
    await expect(page.getByRole("alert")).toHaveText(
      "לא ניתן לטעון את המשימות. רענן את הדף כדי לנסות שוב.",
    );
    await expect(page.getByText(/אין עדיין משימות ברשימה/)).toHaveCount(0);
  });

  test("a refresh shows changes made in the database, with nothing kept in Local Storage", async ({ page, db }) => {
    await replaceTasks(db, [{ title: "לפני השינוי" }]);
    await page.goto("/");
    await expect(page.getByTestId("task-row")).toHaveText(["לפני השינוי"]);

    await replaceTasks(db, [{ title: "אחרי השינוי" }, { title: "משימה נוספת" }]);
    await page.reload();
    await expect(page.getByTestId("task-row")).toHaveText(["אחרי השינוי", "משימה נוספת"]);

    const storage = await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }));
    expect(storage).toEqual({ local: 0, session: 0 });
  });
});
