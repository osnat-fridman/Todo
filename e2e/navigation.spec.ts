import { expect, test } from "./fixtures.js";

test.describe("navigation", () => {
  test("moves between the home page and the about page", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "דף הבית" })).toHaveAttribute("aria-current", "page");

    await page.getByRole("link", { name: "אודות" }).click();
    await expect(page).toHaveURL(/\/about$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("אודות");
    await expect(page.getByRole("link", { name: "אודות" })).toHaveAttribute("aria-current", "page");

    await page.getByRole("link", { name: "דף הבית" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("רשימת המשימות");
  });

  test("a refresh on /about still shows the about page", async ({ page }) => {
    await page.goto("/about");
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("אודות");
    await expect(page.getByText(/זהו אתר TODO List משותף פשוט/)).toBeVisible();
  });

  test("the SPA fallback does not hide the API", async ({ request }) => {
    const response = await request.get("/api/tasks");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/json");
    expect(response.headers()["cache-control"]).toBe("no-store");
    expect(Array.isArray(await response.json())).toBe(true);
  });

  test("the page is right-to-left Hebrew", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("html")).toHaveAttribute("lang", "he");
  });
});
