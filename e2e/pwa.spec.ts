import { expect, test } from "./fixtures.js";

type Manifest = {
  name: string;
  short_name: string;
  lang: string;
  dir: string;
  start_url: string;
  scope: string;
  display: string;
  icons: { src: string; sizes: string; type: string; purpose?: string }[];
};

/** Reads a PNG's width and height from its header. */
function pngSize(body: Buffer) {
  expect(body.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { width: body.readUInt32BE(16), height: body.readUInt32BE(20), colorType: body[25] };
}

test.describe("installable app (PWA)", () => {
  test("the manifest is valid and every icon loads at its size", async ({ request }) => {
    const response = await request.get("/manifest.webmanifest");
    expect(response.status()).toBe(200);
    const manifest = (await response.json()) as Manifest;
    expect(manifest).toMatchObject({
      name: "רשימת המשימות",
      short_name: "משימות",
      lang: "he",
      dir: "rtl",
      start_url: "/",
      scope: "/",
      display: "standalone",
    });

    const sizes = manifest.icons.map((icon) => `${icon.sizes} ${icon.purpose ?? "any"}`);
    expect(sizes).toEqual(expect.arrayContaining(["192x192 any", "512x512 any", "512x512 maskable"]));
    for (const icon of manifest.icons) {
      const image = await request.get(icon.src);
      expect(image.status(), icon.src).toBe(200);
      const [width, height] = icon.sizes.split("x").map(Number);
      expect(pngSize(await image.body())).toMatchObject({ width, height });
    }
  });

  test("the page links the manifest and has the iPhone tags", async ({ page, request }) => {
    await page.goto("/");
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute("content", /viewport-fit=cover/);
    await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute("content", "yes");
    await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute("content", "משימות");
    await expect(page.locator('meta[name="apple-mobile-web-app-status-bar-style"]')).toHaveCount(1);

    const href = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
    const icon = await request.get(href!);
    expect(icon.status()).toBe(200);
    // 180x180 and without transparency (PNG colour type 2 = RGB, no alpha).
    expect(pngSize(await icon.body())).toEqual({ width: 180, height: 180, colorType: 2 });
  });

  test("no service worker is registered and nothing is stored on the device", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("task-row").or(page.getByText("אין עדיין משימות ברשימה", { exact: false }))).not.toHaveCount(0);
    const stored = await page.evaluate(async () => ({
      workers: "serviceWorker" in navigator ? (await navigator.serviceWorker.getRegistrations()).length : 0,
      localStorage: localStorage.length,
      sessionStorage: sessionStorage.length,
      databases: "databases" in indexedDB ? (await indexedDB.databases()).length : 0,
    }));
    expect(stored).toEqual({ workers: 0, localStorage: 0, sessionStorage: 0, databases: 0 });
  });

  test("the new static files do not break /about or the API", async ({ page, request }) => {
    expect((await request.get("/api/tasks")).status()).toBe(200);
    await page.goto("/about");
    await expect(page.getByRole("heading", { level: 1, name: "אודות" })).toBeVisible();
  });
});
