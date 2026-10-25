import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "../../shared/types";
import HomePage from "./HomePage";

const tasks: Task[] = [
  { id: "a", title: "לקנות מצרכים", description: "חלב ולחם", dueDate: "2026-11-01", completed: false, position: 0 },
  { id: "b", title: null, description: "לפנות למוסך\nולקבוע תור", dueDate: null, completed: false, position: 1 },
  { id: "c", title: "לסיים דוח", description: null, dueDate: null, completed: true, position: 2 },
];

function mockFetch(response: Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn(() => response));
}

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HomePage", () => {
  it("shows the loading message while tasks load", () => {
    mockFetch(new Promise(() => {}));
    render(<HomePage />);
    expect(screen.getByText("טוען משימות...")).toBeInTheDocument();
  });

  it("shows tasks in order, with the description when there is no title", async () => {
    mockFetch(jsonResponse(tasks));
    render(<HomePage />);
    const rows = await screen.findAllByTestId("task-row");
    expect(rows.map((row) => row.textContent)).toEqual(["לקנות מצרכים", "לפנות למוסך ולקבוע תור", "לסיים דוח"]);
    expect(rows[2]).toHaveClass("is-completed");
    expect(within(rows[2]).getByRole("checkbox")).toBeChecked();
    expect(rows[0]).not.toHaveClass("is-completed");
  });

  it("starts with no selection", async () => {
    mockFetch(jsonResponse(tasks));
    render(<HomePage />);
    await screen.findAllByTestId("task-row");
    expect(screen.getByText("בחר משימה מהרשימה כדי לצפות בפרטיה")).toBeInTheDocument();
  });

  it("shows the selected task's details", async () => {
    mockFetch(jsonResponse(tasks));
    render(<HomePage />);
    await userEvent.click(await screen.findByRole("button", { name: "לקנות מצרכים" }));
    const details = screen.getByTestId("task-details");
    expect(within(details).getByLabelText("כותרת")).toHaveValue("לקנות מצרכים");
    expect(within(details).getByLabelText("תיאור")).toHaveValue("חלב ולחם");
    expect(within(details).getByLabelText("תאריך יעד")).toHaveValue("2026-11-01");
    expect(screen.queryByText("בחר משימה מהרשימה כדי לצפות בפרטיה")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "לקנות מצרכים" })).toHaveAttribute("aria-pressed", "true");
  });

  it("scrolls to the details on mobile only", async () => {
    mockFetch(jsonResponse(tasks));
    const matchMedia = vi.fn(() => ({ matches: true }) as MediaQueryList);
    vi.stubGlobal("matchMedia", matchMedia);
    render(<HomePage />);
    await userEvent.click(await screen.findByRole("button", { name: "לסיים דוח" }));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);

    matchMedia.mockReturnValue({ matches: false } as MediaQueryList);
    await userEvent.click(screen.getByRole("button", { name: "לקנות מצרכים" }));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("shows the empty-list message when there are no tasks", async () => {
    mockFetch(jsonResponse([]));
    render(<HomePage />);
    expect(await screen.findByText(/אין עדיין משימות ברשימה/)).toBeInTheDocument();
  });

  it("shows a load error, not an empty list, when the server fails", async () => {
    mockFetch(jsonResponse({ error: { code: "DB_UNAVAILABLE", message: "x" } }, 503));
    render(<HomePage />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "לא ניתן לטעון את המשימות. רענן את הדף כדי לנסות שוב.",
    );
    expect(screen.queryByText(/אין עדיין משימות ברשימה/)).not.toBeInTheDocument();
  });

  it("shows a load error when the network is unreachable", async () => {
    mockFetch(Promise.reject(new TypeError("Failed to fetch")));
    render(<HomePage />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
