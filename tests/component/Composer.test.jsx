import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Composer from "../../src/components/Composer.jsx";

// In jsdom there is no window.brainedge, so the Composer uses the in-memory mockBridge.

describe("Composer", () => {
  it("renders a textarea", () => {
    render(<Composer mode="chat" onSend={() => {}} />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("opens the slash menu with built-in commands when typing /", () => {
    render(<Composer mode="chat" onSend={() => {}} />);
    const ta = screen.getByRole("textbox");
    fireEvent.change(ta, { target: { value: "/" } });
    expect(screen.getByText("/new")).toBeInTheDocument();
    expect(screen.getByText("/folder")).toBeInTheDocument(); // /settings was retired when slash commands became inline actions
  });

  it("filters commands by the slash query", () => {
    render(<Composer mode="chat" onSend={() => {}} />);
    const ta = screen.getByRole("textbox");
    fireEvent.change(ta, { target: { value: "/fold" } });
    expect(screen.getByText("/folder")).toBeInTheDocument();
    expect(screen.queryByText("/settings")).not.toBeInTheDocument();
  });

  it("opens the @-mention menu when typing @", () => {
    render(<Composer mode="chat" onSend={() => {}} />);
    const ta = screen.getByRole("textbox");
    fireEvent.change(ta, { target: { value: "@" } });
    expect(screen.getByText(/@-mention them/i)).toBeInTheDocument();
  });

  it("sends the typed message on Enter", () => {
    const onSend = vi.fn();
    render(<Composer mode="chat" onSend={onSend} />);
    const ta = screen.getByRole("textbox");
    fireEvent.change(ta, { target: { value: "hello world" } });
    fireEvent.keyDown(ta, { key: "Enter" });
    expect(onSend).toHaveBeenCalledWith("hello world", []);
  });

  it("does not send on empty input", () => {
    const onSend = vi.fn();
    render(<Composer mode="chat" onSend={onSend} />);
    const ta = screen.getByRole("textbox");
    fireEvent.keyDown(ta, { key: "Enter" });
    expect(onSend).not.toHaveBeenCalled();
  });
});
