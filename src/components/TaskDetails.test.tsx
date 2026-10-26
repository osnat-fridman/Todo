import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "../../shared/types";
import HomePage from "../pages/HomePage";

const GONE = "המשימה כבר לא קיימת. ייתכן שנמחקה על ידי מבקר אחר.";

const tasks: Task[] = [
  { id: "a", title: "לקנות מצרכים", description: "חלב", dueDate: "2099-01-01", completed: false, position: 0 },
  // A saved due date that has already passed.
  { id: "b", title: "ישנה", description: null, dueDate: "2020-05-05", completed: true, position: 1 },
];

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

type Handler = (url: string, body: Record<string, unknown> | null) => Promise<Response>;

/** GET returns `tasks`; PATCH and DELETE go to the given handlers. */
function mockApi(handlers: { patch?: Handler; del?: Handler } = {}) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    if (init?.method === "PATCH") return (handlers.patch ?? vi.fn())(url, body);
    if (init?.method === "DELETE") return (handlers.del ?? vi.fn())(url, body);
    return json(tasks);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const calls = (fetchMock: ReturnType<typeof mockApi>, method: string) =>
  fetchMock.mock.calls.filter(([, init]) => init?.method === method);

async function selectTask(name: string) {
  render(<HomePage />);
  await userEvent.click(await screen.findByRole("button", { name }));
  return screen.getByTestId("task-details");
}

const field = (details: HTMLElement, label: string) => within(details).getByLabelText(label);
const save = (details: HTMLElement) => userEvent.click(within(details).getByRole("button", { name: "שמור שינויים" }));

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("editing task details", () => {
  it("shows editable fields with save and delete buttons", async () => {
    mockApi();
    const details = await selectTask("לקנות מצרכים");
    expect(field(details, "כותרת")).not.toHaveAttribute("readonly");
    expect(field(details, "כותרת")).toHaveAttribute("placeholder", "הזן כותרת (לא חובה)");
    expect(field(details, "תיאור")).toHaveAttribute("placeholder", "הזן תיאור (לא חובה)");
    expect(within(details).getByRole("button", { name: "שמור שינויים" })).toBeEnabled();
    expect(within(details).getByRole("button", { name: "מחק משימה" })).toBeEnabled();
  });

  it("saves the three fields and updates the row from the server's values", async () => {
    const patch = vi.fn<Handler>((_url, body) => json({ ...tasks[0], ...body, completed: true, position: 9 }));
    const fetchMock = mockApi({ patch });
    const details = await selectTask("לקנות מצרכים");
    await userEvent.clear(field(details, "כותרת"));
    await userEvent.type(field(details, "כותרת"), "  חדשה ");
    await userEvent.clear(field(details, "תאריך יעד"));
    await save(details);

    // Without a due date the task moves to the end of the list (PRD FR-11) and stays selected.
    await waitFor(() => expect(screen.getAllByTestId("task-row")[1]).toHaveTextContent("חדשה"));
    expect(screen.getAllByTestId("task-row")[1]).toHaveClass("is-selected");
    expect(calls(fetchMock, "PATCH")[0][0]).toBe("/api/tasks/a");
    expect(patch.mock.calls[0][1]).toEqual({ title: "חדשה", description: "חלב", dueDate: null });
    expect(field(details, "כותרת")).toHaveValue("חדשה");
    // Status and position are not taken from the save response.
    expect(screen.getAllByTestId("task-row")[1]).not.toHaveClass("is-completed");
  });

  it("saves a task whose stored due date is past without changing the date", async () => {
    const patch = vi.fn<Handler>((_url, body) => json({ ...tasks[1], ...body }));
    mockApi({ patch });
    const details = await selectTask("ישנה");
    expect(field(details, "תאריך יעד")).toHaveValue("2020-05-05");
    await userEvent.type(field(details, "כותרת"), " מעודכנת");
    await save(details);
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    expect(patch.mock.calls[0][1]).toMatchObject({ dueDate: "2020-05-05" });
  });

  it("blocks changing the date to another past date", async () => {
    const fetchMock = mockApi();
    const details = await selectTask("ישנה");
    fireEvent.change(field(details, "תאריך יעד"), { target: { value: "2020-05-06" } });
    await save(details);
    expect(within(details).getByText("תאריך היעד לא יכול להיות בעבר")).toBeInTheDocument();
    expect(field(details, "תאריך יעד")).toHaveAttribute("aria-invalid", "true");
    expect(calls(fetchMock, "PATCH")).toHaveLength(0);
  });

  it("shows validation under the field and keeps the values", async () => {
    const fetchMock = mockApi();
    const details = await selectTask("לקנות מצרכים");
    await userEvent.clear(field(details, "כותרת"));
    await userEvent.clear(field(details, "תיאור"));
    await userEvent.type(field(details, "תיאור"), "   ");
    await save(details);
    expect(within(details).getByText("יש להזין כותרת או תיאור למשימה")).toBeInTheDocument();
    expect(field(details, "כותרת")).toHaveAttribute("aria-invalid", "true");
    expect(field(details, "תיאור")).toHaveAttribute("aria-invalid", "true");
    expect(field(details, "תיאור")).toHaveValue("   ");
    expect(calls(fetchMock, "PATCH")).toHaveLength(0);
  });

  it("keeps the edit and shows a message when saving fails, then retries", async () => {
    const patch = vi
      .fn<Handler>()
      .mockImplementationOnce(() => json({ error: { code: "DB_UNAVAILABLE", message: "x" } }, 503))
      .mockImplementationOnce(() => Promise.reject(new TypeError("Failed to fetch")))
      .mockImplementationOnce((_url, body) => json({ ...tasks[0], ...body }));
    mockApi({ patch });
    const details = await selectTask("לקנות מצרכים");
    await userEvent.type(field(details, "תיאור"), " ולחם");
    await save(details);
    expect(await within(details).findByRole("alert")).toHaveTextContent("השמירה נכשלה. נסה שוב.");
    expect(field(details, "תיאור")).toHaveValue("חלב ולחם");

    await save(details);
    expect(await within(details).findByRole("alert")).toHaveTextContent("השמירה נכשלה. נסה שוב.");

    await save(details);
    await waitFor(() => expect(within(details).queryByRole("alert")).not.toBeInTheDocument());
    expect(patch).toHaveBeenCalledTimes(3);
  });

  it("shows the server's field error under the field", async () => {
    mockApi({
      patch: () =>
        json({ error: { code: "VALIDATION_ERROR", message: "תאריך היעד לא יכול להיות בעבר", field: "dueDate" } }, 400),
    });
    const details = await selectTask("לקנות מצרכים");
    await save(details);
    expect(await within(details).findByText("תאריך היעד לא יכול להיות בעבר")).toBeInTheDocument();
    expect(field(details, "תאריך יעד")).toHaveAttribute("aria-invalid", "true");
  });

  it("drops unsaved changes when another task is chosen", async () => {
    const fetchMock = mockApi();
    let details = await selectTask("לקנות מצרכים");
    await userEvent.type(field(details, "כותרת"), " טיוטה");
    await userEvent.click(screen.getByRole("button", { name: "ישנה" }));
    await userEvent.click(screen.getByRole("button", { name: "לקנות מצרכים" }));
    details = screen.getByTestId("task-details");
    expect(field(details, "כותרת")).toHaveValue("לקנות מצרכים");
    expect(calls(fetchMock, "PATCH")).toHaveLength(0);
  });

  it("removes a task deleted by another visitor when saving, and says so", async () => {
    mockApi({ patch: () => json({ error: { code: "TASK_NOT_FOUND", message: GONE } }, 404) });
    const details = await selectTask("לקנות מצרכים");
    await save(details);
    expect(await within(details).findByRole("alert")).toHaveTextContent(GONE);
    expect(within(details).getByText("בחר משימה מהרשימה כדי לצפות בפרטיה")).toBeInTheDocument();
    expect(screen.getAllByTestId("task-row").map((row) => row.textContent)).toEqual(["ישנה"]);

    // The message goes away with the next selection.
    await userEvent.click(screen.getByRole("button", { name: "ישנה" }));
    expect(screen.queryByText(GONE)).not.toBeInTheDocument();
  });
});

describe("deleting a task", () => {
  async function openConfirm(name: string) {
    const details = await selectTask(name);
    await userEvent.click(within(details).getByRole("button", { name: "מחק משימה" }));
    return screen.getByRole("alertdialog", { name: "מחיקת משימה" });
  }

  it("asks for confirmation; cancel and Escape keep the task without a request", async () => {
    const fetchMock = mockApi();
    let dialog = await openConfirm("לקנות מצרכים");
    expect(within(dialog).getByText("האם אתה בטוח שברצונך למחוק את המשימה הזו?")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "ביטול" })).toHaveFocus();
    await userEvent.click(within(dialog).getByRole("button", { name: "ביטול" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(within(screen.getByTestId("task-details")).getByRole("button", { name: "מחק משימה" })).toHaveFocus();

    await userEvent.click(within(screen.getByTestId("task-details")).getByRole("button", { name: "מחק משימה" }));
    dialog = screen.getByRole("alertdialog");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

    expect(calls(fetchMock, "DELETE")).toHaveLength(0);
    expect(screen.getAllByTestId("task-row")).toHaveLength(2);
  });

  it("deletes after confirming and returns the details to the empty state", async () => {
    const fetchMock = mockApi({ del: () => Promise.resolve(new Response(null, { status: 204 })) });
    const dialog = await openConfirm("לקנות מצרכים");
    await userEvent.click(within(dialog).getByRole("button", { name: "אישור" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(calls(fetchMock, "DELETE")[0][0]).toBe("/api/tasks/a");
    expect(screen.getAllByTestId("task-row").map((row) => row.textContent)).toEqual(["ישנה"]);
    expect(screen.getByText("בחר משימה מהרשימה כדי לצפות בפרטיה")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("heading", { name: "פרטי משימה" })).toHaveFocus());
  });

  it("keeps the task when deleting fails, with a message in the dialog", async () => {
    const del = vi
      .fn<Handler>()
      .mockImplementationOnce(() => json({ error: { code: "DB_UNAVAILABLE", message: "x" } }, 503))
      .mockImplementationOnce(() => Promise.resolve(new Response(null, { status: 204 })));
    mockApi({ del });
    const dialog = await openConfirm("לקנות מצרכים");
    await userEvent.click(within(dialog).getByRole("button", { name: "אישור" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("המחיקה נכשלה. נסה שוב.");
    expect(screen.getAllByTestId("task-row")).toHaveLength(2);
    expect(field(screen.getByTestId("task-details"), "כותרת")).toHaveValue("לקנות מצרכים");

    await userEvent.click(within(dialog).getByRole("button", { name: "אישור" }));
    await waitFor(() => expect(screen.getAllByTestId("task-row")).toHaveLength(1));
  });

  it("removes a task deleted by another visitor, and says so", async () => {
    mockApi({ del: () => json({ error: { code: "TASK_NOT_FOUND", message: GONE } }, 404) });
    const dialog = await openConfirm("ישנה");
    await userEvent.click(within(dialog).getByRole("button", { name: "אישור" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent(GONE);
    expect(screen.getAllByTestId("task-row").map((row) => row.textContent)).toEqual(["לקנות מצרכים"]);
  });
});
