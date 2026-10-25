import { test as base } from "@playwright/test";
import type pg from "pg";
import { createTestPool } from "../test-support/devSnapshot.js";

export const test = base.extend<object, { db: pg.Pool }>({
  db: [
    async ({}, use) => {
      const pool = createTestPool();
      await use(pool);
      await pool.end();
    },
    { scope: "worker" },
  ],
});

export { expect } from "@playwright/test";
