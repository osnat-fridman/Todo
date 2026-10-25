import path from "node:path";

// Kept under test-results/ (git-ignored) between global setup and teardown.
export const SNAPSHOT_DIR = path.join("test-results", "dev-snapshot");
export const SNAPSHOT_FILE = path.join(SNAPSHOT_DIR, "tasks.json");
