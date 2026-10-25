import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("[]"))));
});

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("navigation", () => {
  it("moves between the home page and the about page", async () => {
    renderAt("/");
    expect(screen.getByRole("heading", { level: 1, name: "רשימת המשימות" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "דף הבית" })).toHaveAttribute("aria-current", "page");

    await userEvent.click(screen.getByRole("link", { name: "אודות" }));
    expect(screen.getByRole("heading", { level: 1, name: "אודות" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "אודות" })).toHaveAttribute("aria-current", "page");

    await userEvent.click(screen.getByRole("link", { name: "דף הבית" }));
    expect(screen.getByRole("heading", { level: 1, name: "רשימת המשימות" })).toBeInTheDocument();
  });

  it("opens the about page directly", () => {
    renderAt("/about");
    expect(screen.getByText(/זהו אתר TODO List משותף פשוט/)).toBeInTheDocument();
  });

  it("sends unknown paths to the home page", () => {
    renderAt("/no-such-page");
    expect(screen.getByRole("heading", { level: 1, name: "רשימת המשימות" })).toBeInTheDocument();
  });
});
