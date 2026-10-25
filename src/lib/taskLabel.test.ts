import { describe, expect, it } from "vitest";
import { taskLabel } from "./taskLabel";

describe("taskLabel", () => {
  it("uses the title when there is one", () => {
    expect(taskLabel({ title: "לקנות מצרכים", description: "חלב" })).toBe("לקנות מצרכים");
  });

  it("falls back to the description when the title is missing", () => {
    expect(taskLabel({ title: null, description: "לפנות למוסך" })).toBe("לפנות למוסך");
  });

  it("treats a whitespace-only title as missing", () => {
    expect(taskLabel({ title: "   ", description: "תיאור" })).toBe("תיאור");
  });

  it("shows line breaks in the description as single spaces", () => {
    expect(taskLabel({ title: null, description: "שורה ראשונה\n\nשורה  שנייה\r\n" })).toBe(
      "שורה ראשונה שורה שנייה",
    );
  });
});
