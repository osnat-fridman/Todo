// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  isValidDateString,
  localToday,
  MESSAGES,
  normalizeText,
  textLength,
  todayInTimeZone,
  validateTaskInput,
} from "./validation.js";

const TODAY = "2026-10-25";
const validate = (input: { title?: string | null; description?: string | null; dueDate?: string | null }, storedDueDate?: string | null) =>
  validateTaskInput(
    { title: input.title ?? null, description: input.description ?? null, dueDate: input.dueDate ?? null },
    { today: TODAY, storedDueDate },
  );

describe("normalizeText / textLength", () => {
  it("trims and turns whitespace-only text into null", () => {
    expect(normalizeText("  שלום  ")).toBe("שלום");
    expect(normalizeText(" \n\t ")).toBeNull();
    expect(normalizeText(null)).toBeNull();
  });

  it("counts code points, not UTF-16 units", () => {
    expect(textLength("😀😀")).toBe(2);
    expect("😀😀".length).toBe(4);
  });
});

describe("dates", () => {
  it("accepts only real YYYY-MM-DD dates", () => {
    expect(isValidDateString("2026-12-31")).toBe(true);
    expect(isValidDateString("2028-02-29")).toBe(true);
    expect(isValidDateString("2026-02-30")).toBe(false);
    expect(isValidDateString("2026-1-5")).toBe(false);
    expect(isValidDateString("25/10/2026")).toBe(false);
  });

  it("computes today in Israel, which can differ from UTC around midnight", () => {
    // 22:30 UTC on Oct 24 is already Oct 25 in Israel (UTC+3 in summer time).
    const lateNightUtc = new Date("2026-10-24T22:30:00Z");
    expect(todayInTimeZone("Asia/Jerusalem", lateNightUtc)).toBe("2026-10-25");
    expect(todayInTimeZone("UTC", lateNightUtc)).toBe("2026-10-24");
  });

  it("formats the device's local date", () => {
    expect(localToday(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});

describe("validateTaskInput", () => {
  it("accepts a title only, a description only, or both, with or without a date", () => {
    expect(validate({ title: "כותרת" }).errors).toEqual([]);
    expect(validate({ description: "תיאור" }).errors).toEqual([]);
    expect(validate({ title: "כ", description: "ת", dueDate: TODAY }).errors).toEqual([]);
    expect(validate({ title: "כ", dueDate: "2027-01-01" }).errors).toEqual([]);
  });

  it("returns trimmed values with empty text as null", () => {
    expect(validate({ title: "  א  ", description: "   ", dueDate: "" }).value).toEqual({
      title: "א",
      description: null,
      dueDate: null,
    });
  });

  it("requires a title or a description that is not just whitespace", () => {
    expect(validate({ title: "  ", description: "\n \n" }).errors).toEqual([
      { field: "title", message: MESSAGES.titleOrDescription },
    ]);
  });

  it("enforces 100/2000 characters after trimming", () => {
    expect(validate({ title: "א".repeat(100) }).errors).toEqual([]);
    expect(validate({ title: ` ${"א".repeat(100)} ` }).errors).toEqual([]);
    expect(validate({ title: "א".repeat(101) }).errors).toEqual([{ field: "title", message: MESSAGES.titleTooLong }]);
    expect(validate({ title: "😀".repeat(100) }).errors).toEqual([]);
    expect(validate({ description: "א".repeat(2000) }).errors).toEqual([]);
    expect(validate({ description: "א".repeat(2001) }).errors).toEqual([
      { field: "description", message: MESSAGES.descriptionTooLong },
    ]);
  });

  it("rejects a past date and an invalid date", () => {
    expect(validate({ title: "x", dueDate: "2026-10-24" }).errors).toEqual([
      { field: "dueDate", message: MESSAGES.dueDateInPast },
    ]);
    expect(validate({ title: "x", dueDate: "2026-13-01" }).errors).toEqual([
      { field: "dueDate", message: MESSAGES.dueDateInvalid },
    ]);
  });

  it("allows an unchanged stored date that is already in the past", () => {
    expect(validate({ title: "x", dueDate: "2026-01-01" }, "2026-01-01").errors).toEqual([]);
    expect(validate({ title: "x", dueDate: "2026-01-02" }, "2026-01-01").errors).toHaveLength(1);
  });

  it("reports every problem at once", () => {
    expect(validate({ description: "א".repeat(2001), dueDate: "2020-01-01" }).errors.map((e) => e.field)).toEqual([
      "description",
      "dueDate",
    ]);
  });
});
