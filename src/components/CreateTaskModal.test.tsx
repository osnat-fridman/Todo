import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "../../shared/types";
import { localToday } from "../../shared/validation";
import HomePage from "../pages/HomePage";

const existing: Task[] = [
  { id: "a", title: "קיימת", description: null, dueDate: null, completed: false, position: 0 },
];

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

/** Mocks GET /api/tasks with `tasks` and POST with `onPost`. */
function mockApi(tasks: Task[], onPost: (body: Record<string, unknown>) => Promise<Response>) {
  const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
    init?.method === "POST" ? onPost(JSON.parse(String(init.body))) : json(tasks),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const postCalls = (fetchMock: ReturnType<typeof mockApi>) =>
  fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");

async function openModal() {
  render(<HomePage />);
  await userEvent.click(await screen.findByRole("button", { name: "הוסף משימה" }));
  return screen.getByRole("dialog", { name: "הוספת משימה" });
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("create task modal", () => {
  it("opens with empty fields, placeholders and today's date", async () => {
    mockApi(existing, vi.fn());
    const dialog = await openModal();
    expect(within(dialog).getByLabelText("כותרת")).toHaveValue("");
    expect(within(dialog).getByLabelText("כותרת")).toHaveAttribute("placeholder", "הזן כותרת (לא חובה)");
    expect(within(dialog).getByLabelText("כותרת")).toHaveFocus();
    expect(within(dialog).getByLabelText("תיאור")).toHaveAttribute("placeholder", "הזן תיאור (לא חובה)");
    expect(within(dialog).getByLabelText("תאריך יעד")).toHaveValue(localToday());
    expect(within(dialog).getByLabelText("תאריך יעד")).toHaveAttribute("type", "date");
  });

  it("blocks empty input and marks both title and description", async () => {
    const fetchMock = mockApi(existing, vi.fn());
    const dialog = await openModal();
    await userEvent.type(within(dialog).getByLabelText("כותרת"), "   ");
    await userEvent.click(within(dialog).getByRole("button", { name: "הוסף משימה" }));

    expect(within(dialog).getByText("יש להזין כותרת או תיאור למשימה")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("כותרת")).toHaveAttribute("aria-invalid", "true");
    expect(within(dialog).getByLabelText("תיאור")).toHaveAttribute("aria-invalid", "true");
    expect(within(dialog).getByLabelText("כותרת")).toHaveValue("   ");
    expect(postCalls(fetchMock)).toHaveLength(0);
  });

  it("shows length and date messages under their fields", async () => {
    mockApi(existing, vi.fn());
    const dialog = await openModal();
    fireEvent.change(within(dialog).getByLabelText("כותרת"), { target: { value: "א".repeat(101) } });
    fireEvent.change(within(dialog).getByLabelText("תיאור"), { target: { value: "ב".repeat(2001) } });
    fireEvent.change(within(dialog).getByLabelText("תאריך יעד"), { target: { value: "2000-01-01" } });
    await userEvent.click(within(dialog).getByRole("button", { name: "הוסף משימה" }));

    expect(within(dialog).getByText("הכותרת יכולה להכיל עד 100 תווים")).toBeInTheDocument();
    expect(within(dialog).getByText("התיאור יכול להכיל עד 2,000 תווים")).toBeInTheDocument();
    expect(within(dialog).getByText("תאריך היעד לא יכול להיות בעבר")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("תאריך יעד")).toHaveAttribute("aria-invalid", "true");
  });

  it("saves without a due date, adds the task at the end and selects it", async () => {
    const created: Task = { id: "new", title: "חדשה", description: null, dueDate: null, completed: false, position: 1 };
    const fetchMock = mockApi(existing, () => json(created, 201));
    const dialog = await openModal();
    await userEvent.type(within(dialog).getByLabelText("כותרת"), "  חדשה ");
    await userEvent.clear(within(dialog).getByLabelText("תאריך יעד"));
    await userEvent.click(within(dialog).getByRole("button", { name: "הוסף משימה" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(JSON.parse(String(postCalls(fetchMock)[0][1]?.body))).toEqual({
      title: "חדשה",
      description: null,
      dueDate: null,
    });
    const rows = screen.getAllByTestId("task-row");
    expect(rows.map((row) => row.textContent)).toEqual(["קיימת", "חדשה"]);
    expect(rows[1]).toHaveClass("is-selected");
    expect(within(screen.getByTestId("task-details")).getByLabelText("כותרת")).toHaveValue("חדשה");
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "הוסף משימה" })).toHaveFocus();
  });

  it("sends only one request when the save button is pressed twice", async () => {
    let resolve!: (r: Response) => void;
    const fetchMock = mockApi(existing, () => new Promise<Response>((r) => (resolve = r)));
    const dialog = await openModal();
    await userEvent.type(within(dialog).getByLabelText("תיאור"), "תיאור");
    const save = within(dialog).getByRole("button", { name: "הוסף משימה" });
    await userEvent.click(save);
    expect(save).toBeDisabled();
    fireEvent.submit(save.closest("form")!);
    expect(postCalls(fetchMock)).toHaveLength(1);
    resolve(new Response(JSON.stringify({ ...existing[0], id: "n", title: null, description: "תיאור" }), { status: 201 }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("keeps the values and shows a message when the server fails, then retries", async () => {
    const onPost = vi
      .fn()
      .mockImplementationOnce(() => json({ error: { code: "DB_UNAVAILABLE", message: "x" } }, 503))
      .mockImplementationOnce(() => Promise.reject(new TypeError("Failed to fetch")))
      .mockImplementationOnce(() => json({ ...existing[0], id: "n", title: "נסיון" }, 201));
    mockApi(existing, onPost);
    const dialog = await openModal();
    await userEvent.type(within(dialog).getByLabelText("כותרת"), "נסיון");
    await userEvent.click(within(dialog).getByRole("button", { name: "הוסף משימה" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("השמירה נכשלה. נסה שוב.");
    expect(within(dialog).getByLabelText("כותרת")).toHaveValue("נסיון");

    await userEvent.click(within(dialog).getByRole("button", { name: "הוסף משימה" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("השמירה נכשלה. נסה שוב.");

    await userEvent.click(within(dialog).getByRole("button", { name: "הוסף משימה" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("shows the server's field error under the field and the full-list error in the form", async () => {
    const onPost = vi
      .fn()
      .mockImplementationOnce(() =>
        json({ error: { code: "VALIDATION_ERROR", message: "תאריך היעד לא יכול להיות בעבר", field: "dueDate" } }, 400),
      )
      .mockImplementationOnce(() => json({ error: { code: "TASK_LIMIT_REACHED", message: "x" } }, 409));
    mockApi(existing, onPost);
    const dialog = await openModal();
    await userEvent.type(within(dialog).getByLabelText("כותרת"), "x");
    await userEvent.click(within(dialog).getByRole("button", { name: "הוסף משימה" }));
    expect(await within(dialog).findByText("תאריך היעד לא יכול להיות בעבר")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("תאריך יעד")).toHaveAttribute("aria-invalid", "true");

    await userEvent.click(within(dialog).getByRole("button", { name: "הוסף משימה" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "הרשימה מלאה (1,000 משימות). כדי להוסיף משימה יש למחוק משימה קיימת.",
    );
    expect(within(dialog).getByLabelText("כותרת")).toHaveValue("x");
  });

  it("closing without saving discards the input, with X, the close button or Escape", async () => {
    const fetchMock = mockApi(existing, vi.fn());
    let dialog = await openModal();
    await userEvent.type(within(dialog).getByLabelText("כותרת"), "טיוטה");
    await userEvent.click(within(dialog).getAllByRole("button", { name: "סגור" })[0]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "הוסף משימה" })).toHaveFocus();

    await userEvent.click(screen.getByRole("button", { name: "הוסף משימה" }));
    dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("כותרת")).toHaveValue("");
    expect(within(dialog).getByLabelText("תאריך יעד")).toHaveValue(localToday());
    await userEvent.type(within(dialog).getByLabelText("תיאור"), "עוד");
    await userEvent.click(within(dialog).getAllByRole("button", { name: "סגור" })[1]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "הוסף משימה" }));
    expect(within(screen.getByRole("dialog")).getByLabelText("תיאור")).toHaveValue("");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(postCalls(fetchMock)).toHaveLength(0);
  });

  it("disables the add button with a message when the list holds 1,000 tasks", async () => {
    const full = Array.from({ length: 1000 }, (_, i) => ({ ...existing[0], id: `t${i}`, title: `משימה ${i}`, position: i }));
    mockApi(full, vi.fn());
    render(<HomePage />);
    expect(await screen.findByRole("button", { name: "הוסף משימה" })).toBeDisabled();
    expect(
      screen.getByText("הרשימה מלאה (1,000 משימות). כדי להוסיף משימה יש למחוק משימה קיימת."),
    ).toBeInTheDocument();
  });

  it("keeps the add button available below the limit", async () => {
    mockApi(existing.concat(Array.from({ length: 998 }, (_, i) => ({ ...existing[0], id: `t${i}`, position: i + 1 }))), vi.fn());
    render(<HomePage />);
    await screen.findAllByTestId("task-row");
    expect(screen.getByRole("button", { name: "הוסף משימה" })).toBeEnabled();
    expect(screen.queryByText(/הרשימה מלאה/)).not.toBeInTheDocument();
  });

  it("keeps the add button unavailable while loading and after a load error", async () => {
    let fail!: () => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((_, reject) => (fail = () => reject(new TypeError("x"))))));
    render(<HomePage />);
    expect(screen.getByRole("button", { name: "הוסף משימה" })).toBeDisabled();
    fail();
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: "הוסף משימה" })).toBeDisabled();
  });
});
