import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "../../shared/types";
import HomePage from "./HomePage";

const tasks: Task[] = [
  { id: "a", title: "לקנות מצרכים", description: null, dueDate: null, completed: false, position: 0 },
  { id: "b", title: "לתכנן חופשה", description: null, dueDate: null, completed: false, position: 1 },
  { id: "c", title: "לסיים דוח", description: null, dueDate: null, completed: true, position: 2 },
];

/** The server's answer to a saved order: the tasks with their new positions. */
function inOrder(...ordered: Task[]): Task[] {
  return ordered.map((task, position) => ({ ...task, position }));
}

type Call = { url: string; method: string; body: unknown };
type Reply = { status: number; body?: unknown } | "network-error" | Promise<{ status: number; body?: unknown }>;

/** Routes fetch: GET /api/tasks answers the list; other requests answer from `reply`. */
function mockServer(reply: (call: Call) => Reply, list: () => Task[] = () => tasks) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method === "GET") return new Response(JSON.stringify(list()), { status: 200 });
      const call = { url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined };
      calls.push(call);
      const answer = await reply(call);
      if (answer === "network-error") throw new TypeError("Failed to fetch");
      return new Response(answer.body === undefined ? null : JSON.stringify(answer.body), { status: answer.status });
    }),
  );
  return calls;
}

function rowTexts() {
  return screen.getAllByTestId("task-row").map((row) => row.textContent);
}

function checkbox(name: RegExp) {
  return screen.getByRole("checkbox", { name });
}

// jsdom has no layout; give each row a place so dnd-kit's keyboard sensor can move between them.
function layOutRows() {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const row = this.closest("[data-task-id]");
    const index = row ? Array.from(row.parentElement!.children).indexOf(row) : 0;
    const top = index * 50;
    return { x: 0, y: top, top, left: 0, right: 300, bottom: top + 50, width: 300, height: 50, toJSON() {} } as DOMRect;
  });
}

/** Presses a key and lets dnd-kit's timers run (its keyboard sensor listens from the next tick). */
async function press(target: Element | Document, code: string, key: string) {
  await act(async () => {
    fireEvent.keyDown(target, { code, key });
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** Moves a task one place down with the keyboard (space, arrow down, space). */
async function moveDown(label: string) {
  const handle = screen.getByRole("button", { name: `גרור כדי לשנות את מיקום המשימה: ${label}` });
  handle.focus();
  await press(handle, "Space", " ");
  await press(handle, "ArrowDown", "ArrowDown");
  await press(handle, "Space", " ");
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("HomePage – status", () => {
  it("marks and unmarks a task, saving the explicit value without moving it", async () => {
    const calls = mockServer(({ body }) => ({ status: 200, body: { ...tasks[0], ...(body as object) } }));
    render(<HomePage />);
    await screen.findAllByTestId("task-row");

    await userEvent.click(checkbox(/לקנות מצרכים/));
    expect(checkbox(/לקנות מצרכים/)).toBeChecked();
    expect(screen.getAllByTestId("task-row")[0]).toHaveClass("is-completed");
    await userEvent.click(checkbox(/לקנות מצרכים/));
    expect(checkbox(/לקנות מצרכים/)).not.toBeChecked();

    expect(calls).toEqual([
      { url: "/api/tasks/a/status", method: "PATCH", body: { completed: true } },
      { url: "/api/tasks/a/status", method: "PATCH", body: { completed: false } },
    ]);
    expect(rowTexts()).toEqual(["לקנות מצרכים", "לתכנן חופשה", "לסיים דוח"]);
  });

  it("does not select the task when its checkbox is clicked", async () => {
    mockServer(() => ({ status: 200, body: tasks[1] }));
    render(<HomePage />);
    await screen.findAllByTestId("task-row");
    await userEvent.click(checkbox(/לתכנן חופשה/));
    expect(screen.getByText("בחר משימה מהרשימה כדי לצפות בפרטיה")).toBeInTheDocument();
  });

  it("disables the checkbox until the server answers", async () => {
    let answer!: (reply: { status: number; body?: unknown }) => void;
    mockServer(() => new Promise((resolve) => (answer = resolve)));
    render(<HomePage />);
    await screen.findAllByTestId("task-row");

    await userEvent.click(checkbox(/לתכנן חופשה/));
    expect(checkbox(/לתכנן חופשה/)).toBeDisabled();
    await act(async () => answer({ status: 200, body: { ...tasks[1], completed: true } }));
    expect(checkbox(/לתכנן חופשה/)).toBeEnabled();
    expect(checkbox(/לתכנן חופשה/)).toBeChecked();
  });

  it.each([
    ["a server error", { status: 500 }],
    ["a network error", "network-error" as const],
  ])("puts the checkbox back and shows a message after %s", async (_name, reply) => {
    mockServer(() => reply);
    render(<HomePage />);
    await screen.findAllByTestId("task-row");

    await userEvent.click(checkbox(/לסיים דוח/));
    expect(await screen.findByText("שינוי הסטטוס נכשל. נסה שוב.")).toBeInTheDocument();
    expect(checkbox(/לסיים דוח/)).toBeChecked();
  });

  it("removes a task deleted by another visitor and says so above the list", async () => {
    mockServer(() => ({ status: 404 }));
    render(<HomePage />);
    await screen.findAllByTestId("task-row");

    await userEvent.click(checkbox(/לתכנן חופשה/));
    expect(await screen.findByText("המשימה כבר לא קיימת. ייתכן שנמחקה על ידי מבקר אחר.")).toBeInTheDocument();
    expect(rowTexts()).toEqual(["לקנות מצרכים", "לסיים דוח"]);
  });

  it("clears the selection when the selected task turns out to be deleted", async () => {
    mockServer(() => ({ status: 404 }));
    render(<HomePage />);
    await userEvent.click(await screen.findByRole("button", { name: "לתכנן חופשה" }));

    await userEvent.click(checkbox(/לתכנן חופשה/));
    const details = screen.getByTestId("task-details");
    expect(await within(details).findByText("המשימה כבר לא קיימת. ייתכן שנמחקה על ידי מבקר אחר.")).toBeInTheDocument();
    expect(within(details).getByText("בחר משימה מהרשימה כדי לצפות בפרטיה")).toBeInTheDocument();
  });

  it("keeps an unsaved edit of the selected task when its checkbox changes", async () => {
    const calls = mockServer(() => ({ status: 200, body: { ...tasks[0], completed: true } }));
    render(<HomePage />);
    await userEvent.click(await screen.findByRole("button", { name: "לקנות מצרכים" }));
    const title = within(screen.getByTestId("task-details")).getByLabelText("כותרת");
    await userEvent.clear(title);
    await userEvent.type(title, "טיוטה");

    await userEvent.click(checkbox(/לקנות מצרכים/));
    expect(checkbox(/לקנות מצרכים/)).toBeChecked();
    expect(title).toHaveValue("טיוטה");
    expect(calls.map((call) => call.url)).toEqual(["/api/tasks/a/status"]);
  });
});

describe("HomePage – order", () => {
  beforeEach(layOutRows);

  it("moves a task and saves every id in the new order", async () => {
    const calls = mockServer(() => ({ status: 200, body: inOrder(tasks[1], tasks[0], tasks[2]) }));
    render(<HomePage />);
    await screen.findAllByTestId("task-row");

    await moveDown("לקנות מצרכים");
    expect(rowTexts()).toEqual(["לתכנן חופשה", "לקנות מצרכים", "לסיים דוח"]);
    expect(calls).toEqual([{ url: "/api/tasks/order", method: "PUT", body: { orderedIds: ["b", "a", "c"] } }]);
  });

  it("puts the previous order back and shows a message when saving fails", async () => {
    mockServer(() => ({ status: 500 }));
    render(<HomePage />);
    await screen.findAllByTestId("task-row");

    await moveDown("לקנות מצרכים");
    expect(await screen.findByText("שמירת הסדר נכשלה, והסדר הקודם הוחזר.")).toBeInTheDocument();
    expect(rowTexts()).toEqual(["לקנות מצרכים", "לתכנן חופשה", "לסיים דוח"]);
    expect(screen.queryByRole("button", { name: "רענן את הרשימה" })).not.toBeInTheDocument();
  });

  it("on 409 keeps the previous order and offers to reload the list from the server", async () => {
    const added: Task = { id: "d", title: "משימה של מבקר אחר", description: null, dueDate: null, completed: false, position: 3 };
    let serverList = tasks;
    mockServer(
      () => ({ status: 409, body: { error: { code: "ORDER_CONFLICT", message: "x" } } }),
      () => serverList,
    );
    render(<HomePage />);
    await screen.findAllByTestId("task-row");

    await moveDown("לקנות מצרכים");
    expect(await screen.findByText("הרשימה השתנתה בינתיים. רענן את הרשימה ונסה שוב.")).toBeInTheDocument();
    expect(rowTexts()).toEqual(["לקנות מצרכים", "לתכנן חופשה", "לסיים דוח"]);

    serverList = [...tasks, added];
    await userEvent.click(screen.getByRole("button", { name: "רענן את הרשימה" }));
    expect(rowTexts()).toEqual(["לקנות מצרכים", "לתכנן חופשה", "לסיים דוח", "משימה של מבקר אחר"]);
    expect(screen.queryByText("הרשימה השתנתה בינתיים. רענן את הרשימה ונסה שוב.")).not.toBeInTheDocument();
  });

  it("does not start another drag until the previous order is saved", async () => {
    let answer!: (reply: { status: number; body?: unknown }) => void;
    const calls = mockServer(() => new Promise((resolve) => (answer = resolve)));
    render(<HomePage />);
    await screen.findAllByTestId("task-row");

    await moveDown("לקנות מצרכים");
    await moveDown("לתכנן חופשה");
    expect(calls).toHaveLength(1);
    await act(async () => answer({ status: 200, body: inOrder(tasks[1], tasks[0], tasks[2]) }));
    await moveDown("לקנות מצרכים");
    expect(calls).toHaveLength(2);
  });

  it("keeps the selection and an unsaved edit when the selected task is moved", async () => {
    mockServer(() => ({ status: 200, body: inOrder(tasks[1], tasks[0], tasks[2]) }));
    render(<HomePage />);
    await userEvent.click(await screen.findByRole("button", { name: "לקנות מצרכים" }));
    const title = within(screen.getByTestId("task-details")).getByLabelText("כותרת");
    await userEvent.type(title, " נוסף");

    await moveDown("לקנות מצרכים");
    expect(rowTexts()).toEqual(["לתכנן חופשה", "לקנות מצרכים", "לסיים דוח"]);
    expect(within(screen.getByTestId("task-details")).getByLabelText("כותרת")).toHaveValue("לקנות מצרכים נוסף");
    expect(screen.getByRole("button", { name: "לקנות מצרכים" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("HomePage – due date order", () => {
  beforeEach(layOutRows);

  const dated: Task[] = [
    { id: "n", title: "בלי תאריך", description: null, dueDate: null, completed: false, position: 0 },
    { id: "f2", title: "עתידית שנייה", description: null, dueDate: "2099-01-01", completed: false, position: 1 },
    { id: "o", title: "באיחור", description: null, dueDate: "2020-01-01", completed: false, position: 2 },
    { id: "f1", title: "עתידית ראשונה", description: null, dueDate: "2099-01-01", completed: false, position: 3 },
    { id: "d", title: "הושלמה בעבר", description: null, dueDate: "2020-01-01", completed: true, position: 4 },
  ];

  function rowTitles() {
    return screen.getAllByTestId("task-row").map((row) => row.querySelector(".task-row-text")!.textContent);
  }

  it("shows overdue tasks first and marked, then by nearest date, then tasks without a date", async () => {
    mockServer(() => ({ status: 200 }), () => dated);
    render(<HomePage />);
    await screen.findAllByTestId("task-row");

    expect(rowTitles()).toEqual(["באיחור", "הושלמה בעבר", "עתידית שנייה", "עתידית ראשונה", "בלי תאריך"]);
    const [overdue, completedPast] = screen.getAllByTestId("task-row");
    expect(overdue).toHaveClass("is-overdue");
    expect(overdue).toHaveTextContent("באיחור: 01/01/2020");
    expect(completedPast).not.toHaveClass("is-overdue");
    expect(completedPast.querySelector(".task-row-overdue")).toBeNull();
  });

  it("moves a task among tasks with the same date and saves the whole shown order", async () => {
    const calls = mockServer(
      () => ({ status: 200, body: inOrder(dated[2], dated[4], dated[3], dated[1], dated[0]) }),
      () => dated,
    );
    render(<HomePage />);
    await screen.findAllByTestId("task-row");

    await moveDown("עתידית שנייה");
    expect(rowTitles()).toEqual(["באיחור", "הושלמה בעבר", "עתידית ראשונה", "עתידית שנייה", "בלי תאריך"]);
    expect(calls).toEqual([{ url: "/api/tasks/order", method: "PUT", body: { orderedIds: ["o", "d", "f1", "f2", "n"] } }]);
  });

  it("puts a task dropped on another date back, without saving, and says why", async () => {
    const calls = mockServer(() => ({ status: 200 }), () => dated);
    render(<HomePage />);
    await screen.findAllByTestId("task-row");

    await moveDown("עתידית ראשונה");
    expect(await screen.findByText("אפשר להזיז משימה רק בין משימות עם אותו תאריך יעד.")).toBeInTheDocument();
    expect(rowTitles()).toEqual(["באיחור", "הושלמה בעבר", "עתידית שנייה", "עתידית ראשונה", "בלי תאריך"]);
    expect(calls).toEqual([]);
  });

  it("keeps an overdue task apart from a completed one with the same date", async () => {
    const calls = mockServer(() => ({ status: 200 }), () => dated);
    render(<HomePage />);
    await screen.findAllByTestId("task-row");

    await moveDown("באיחור");
    expect(await screen.findByText("אפשר להזיז משימה רק בין משימות עם אותו תאריך יעד.")).toBeInTheDocument();
    expect(calls).toEqual([]);
  });

  it("an overdue task that is completed is no longer marked, and comes back when reopened", async () => {
    mockServer(({ body }) => ({ status: 200, body: { ...dated[2], ...(body as object) } }), () => dated);
    render(<HomePage />);
    await screen.findAllByTestId("task-row");

    await userEvent.click(checkbox(/באיחור/));
    expect(rowTitles()).toEqual(["באיחור", "הושלמה בעבר", "עתידית שנייה", "עתידית ראשונה", "בלי תאריך"]);
    expect(screen.getAllByTestId("task-row")[0]).not.toHaveClass("is-overdue");

    await userEvent.click(checkbox(/באיחור/));
    expect(screen.getAllByTestId("task-row")[0]).toHaveClass("is-overdue");
  });

  it("a completed task from the past that is reopened becomes overdue and moves to the top", async () => {
    mockServer(({ body }) => ({ status: 200, body: { ...dated[4], ...(body as object) } }), () => dated);
    render(<HomePage />);
    await screen.findAllByTestId("task-row");

    await userEvent.click(checkbox(/באיחור/));
    await userEvent.click(checkbox(/הושלמה בעבר/));
    expect(rowTitles()).toEqual(["הושלמה בעבר", "באיחור", "עתידית שנייה", "עתידית ראשונה", "בלי תאריך"]);
    expect(screen.getAllByTestId("task-row")[0]).toHaveClass("is-overdue");
  });
});
