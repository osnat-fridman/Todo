import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.js";
import { replaceTasks } from "../test-support/devSnapshot.js";

/** True when the page is wider than the screen (horizontal scrolling). */
function overflows(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
}

test.describe("layout and design rules", () => {
  test.beforeEach(async ({ db }) => {
    await replaceTasks(db, [
      { title: "משימה עם כותרת ארוכה מאוד שצריכה להיקטע בסוף השורה ולא לשבור את הפריסה של הדף" },
      { title: "שנייה", completed: true },
    ]);
  });

  test("every text field is at least 16px, so Safari on iPhone does not zoom in", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "שנייה", exact: true }).click();
    await page.getByRole("button", { name: "הוסף משימה" }).click();
    const sizes = await page
      .locator("input:not([type=checkbox]), textarea")
      .evaluateAll((fields) => fields.map((field) => parseFloat(getComputedStyle(field).fontSize)));
    expect(sizes.length).toBeGreaterThanOrEqual(6);
    for (const size of sizes) expect(size).toBeGreaterThanOrEqual(16);
  });

  for (const width of [360, 390]) {
    test(`no sideways scrolling at ${width}px, on both pages and in the modals`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/");
      await page.getByRole("button", { name: "שנייה", exact: true }).click();
      expect(await overflows(page)).toBe(false);

      await page.getByTestId("task-details").getByRole("button", { name: "מחק משימה" }).click();
      expect(await overflows(page)).toBe(false);
      await page.getByRole("button", { name: "ביטול" }).click();

      await page.getByRole("button", { name: "הוסף משימה" }).click();
      expect(await overflows(page)).toBe(false);
      await page.keyboard.press("Escape");

      await page.goto("/about");
      expect(await overflows(page)).toBe(false);
    });
  }

  test("on a phone every control has a touch area of at least 44px", async ({ page, isMobile }) => {
    test.skip(!isMobile, "touch sizes are checked on the phone projects");
    await page.goto("/");
    await page.getByRole("button", { name: "שנייה", exact: true }).click();
    const controls = page.locator("a, button, input[type=checkbox], input, textarea");
    const boxes = await controls.evaluateAll((elements) =>
      elements
        .filter((element) => (element as HTMLElement).offsetParent !== null)
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return { name: element.getAttribute("aria-label") ?? element.textContent?.trim(), width: rect.width, height: rect.height };
        }),
    );
    for (const box of boxes) {
      expect(Math.round(box.height), `${box.name} height`).toBeGreaterThanOrEqual(44);
      expect(Math.round(box.width), `${box.name} width`).toBeGreaterThanOrEqual(44);
    }
  });

  test("only what the PRD defines: two menu links, and only the label in each row", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("navigation").getByRole("link")).toHaveText(["דף הבית", "אודות"]);
    const row = page.getByTestId("task-row").first();
    // A select button, a checkbox and a drag handle; no date, menu or extra text.
    await expect(row.getByRole("button")).toHaveCount(2);
    await expect(row.getByRole("checkbox")).toHaveCount(1);
    await expect(row).toHaveText("משימה עם כותרת ארוכה מאוד שצריכה להיקטע בסוף השורה ולא לשבור את הפריסה של הדף");
    // The long label stays on one line.
    const text = row.locator(".task-row-text");
    const lineHeight = await text.evaluate((element) => parseFloat(getComputedStyle(element).lineHeight));
    expect((await text.boundingBox())!.height).toBeLessThanOrEqual(lineHeight + 1);
  });
});
