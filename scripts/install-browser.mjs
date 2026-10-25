// Installs Playwright's Chromium and WebKit inside node_modules (ADR-11),
// so no browser is installed globally on the machine.
import { spawnSync } from "node:child_process";

if (process.env.SKIP_BROWSER_INSTALL) {
  console.log("Skipping Playwright browser install (SKIP_BROWSER_INSTALL is set).");
  process.exit(0);
}

const result = spawnSync("npx", ["playwright", "install", "chromium", "webkit"], {
  stdio: "inherit",
  env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: "0" },
});
process.exit(result.status ?? 1);
