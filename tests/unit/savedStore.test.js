import { describe, it, expect, beforeEach } from "vitest";
import os from "os";
import path from "path";
import fs from "fs";
import savedStore from "../../electron/saved-store.cjs";

const file = path.join(os.tmpdir(), "brainedge-test", "brainedge-saved.json");

beforeEach(() => { try { fs.unlinkSync(file); } catch {} });

describe("saved-store", () => {
  it("adds and lists a saved item with defaults", () => {
    const rec = savedStore.addSaved({ text: "An answer", question: "A question" });
    expect(rec.id).toMatch(/^sav_/);
    expect(rec.tags).toEqual([]);
    const list = savedStore.listSaved();
    expect(list).toHaveLength(1);
    expect(list[0].text).toBe("An answer");
    expect(list[0].question).toBe("A question");
  });

  it("updates note and tags", () => {
    const rec = savedStore.addSaved({ text: "x" });
    savedStore.updateSaved(rec.id, { note: "hello", tags: ["a", "b"] });
    const got = savedStore.listSaved().find((x) => x.id === rec.id);
    expect(got.note).toBe("hello");
    expect(got.tags).toEqual(["a", "b"]);
  });

  it("removes an item", () => {
    const rec = savedStore.addSaved({ text: "y" });
    savedStore.removeSaved(rec.id);
    expect(savedStore.listSaved().find((x) => x.id === rec.id)).toBeUndefined();
  });

  it("sorts newest first", async () => {
    const a = savedStore.addSaved({ text: "first" });
    await new Promise((r) => setTimeout(r, 5)); // distinct timestamps — same-ms adds made this flaky
    const b = savedStore.addSaved({ text: "second" });
    const list = savedStore.listSaved();
    expect(list[0].id).toBe(b.id);
    expect(list[1].id).toBe(a.id);
  });
});
