// Renders the PWA icons from the SVG sources in public/icons (ADR-10, ADR-18),
// using Playwright's Chromium that is already installed inside the project.
// The PNG files are committed; Vercel's build does not run this script.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const iconsDir = fileURLToPath(new URL("../public/icons/", import.meta.url));

// [source SVG, output PNG, size]. The full-bleed (maskable) source has no transparent
// corners, so it is also used for the Apple icon, which must not be transparent.
const outputs = [
  ["icon.svg", "icon-192.png", 192],
  ["icon.svg", "icon-512.png", 512],
  ["icon.svg", "favicon-32.png", 32],
  ["icon-maskable.svg", "icon-maskable-512.png", 512],
  ["icon-maskable.svg", "apple-touch-icon.png", 180],
];

const browser = await chromium.launch();
try {
  for (const [source, output, size] of outputs) {
    const svg = await readFile(iconsDir + source, "utf8");
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(
      `<html><body style="margin:0;background:transparent">` +
        `<img src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}" width="${size}" height="${size}" style="display:block">` +
        `</body></html>`,
    );
    await page.screenshot({ path: iconsDir + output, omitBackground: true });
    await page.close();
    console.log(`Created public/icons/${output} (${size}x${size})`);
  }
} finally {
  await browser.close();
}
