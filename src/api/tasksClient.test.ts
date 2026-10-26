import { afterEach, describe, expect, it, vi } from "vitest";
import { createTask, OFFLINE_ACTION_MESSAGE, SAVE_FAILED_MESSAGE, setTaskCompleted, STATUS_FAILED_MESSAGE } from "./tasksClient";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function failNetwork() {
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
}

describe("network failures", () => {
  it("say there is no connection when the browser is offline", async () => {
    failNetwork();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    expect(await createTask({ title: "x", description: "", dueDate: null })).toEqual({
      ok: false,
      message: OFFLINE_ACTION_MESSAGE,
    });
    expect(await setTaskCompleted("id", true)).toEqual({ ok: false, message: OFFLINE_ACTION_MESSAGE });
  });

  it("keep the action's own message while the browser is online", async () => {
    failNetwork();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    expect(await createTask({ title: "x", description: "", dueDate: null })).toEqual({
      ok: false,
      message: SAVE_FAILED_MESSAGE,
    });
    expect(await setTaskCompleted("id", true)).toEqual({ ok: false, message: STATUS_FAILED_MESSAGE });
  });
});
