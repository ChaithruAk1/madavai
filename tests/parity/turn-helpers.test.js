import { describe, it, expect } from "vitest";
import { createRequire } from "module";
import * as core from "../../core/turn-helpers.js";

// ADR-0001 / M2a. core/turn-helpers.js is a VERBATIM extraction of the pure turn-loop helpers
// from the desktop reference electron/harness.cjs (desktop is the single source). The first
// describe LOCKS that: each helper's source (Function.prototype.toString, which omits `export`)
// must be byte-identical to the live desktop copy, so the extraction cannot silently drift.
// Web's src/shared/harness.js mirror converges onto these when it adopts the core (M2d) — notably
// squashStale, whose web copy currently differs ("[result of" vs the desktop "[result of ").
const require = createRequire(import.meta.url);
const desktop = require("../../electron/harness.cjs");

const { tolerantParse, headTail, squashStale, CallGuard, ctxWindowFor, parseTextToolCalls } = core;

describe("core/turn-helpers — byte-identical to desktop reference electron/harness.cjs", () => {
  for (const n of ["tolerantParse", "headTail", "squashStale", "ctxWindowFor", "parseTextToolCalls", "TEXT_PROTOCOL", "CallGuard"]) {
    it(`${n} is extracted verbatim (toString() === harness.cjs)`, () => {
      expect(typeof core[n]).toBe(typeof desktop[n]);
      expect(core[n].toString()).toBe(desktop[n].toString());
    });
  }
});

describe("tolerantParse — JSON repair ladder", () => {
  it("clean JSON is not flagged repaired", () => {
    expect(tolerantParse('{"a":1}')).toEqual({ ok: true, value: { a: 1 }, repaired: false });
  });
  it("empty input -> empty object", () => {
    expect(tolerantParse("")).toEqual({ ok: true, value: {}, repaired: false });
  });
  it("trailing comma repaired", () => {
    const r = tolerantParse('{"a":1,}');
    expect(r.ok).toBe(true);
    expect(r.value).toEqual({ a: 1 });
    expect(r.repaired).toBe(true);
  });
  it("single quotes repaired", () => {
    expect(tolerantParse("{'a':'b'}").value).toEqual({ a: "b" });
  });
  it("smart quotes repaired", () => {
    expect(tolerantParse('{“a”:1}').value).toEqual({ a: 1 });
  });
  it("wrapping code fence stripped", () => {
    expect(tolerantParse('```json\n{"a":1}\n```').value).toEqual({ a: 1 });
  });
  it("unquoted keys quoted", () => {
    expect(tolerantParse('{a:1}').value).toEqual({ a: 1 });
  });
  it("raw control character stripped", () => {
    expect(tolerantParse('{"a":1' + String.fromCharCode(0) + '}').value).toEqual({ a: 1 });
  });
  it("bare newline inside a string literal escaped", () => {
    expect(tolerantParse('{"a":"x\ny"}').value).toEqual({ a: "x\ny" });
  });
  it("extracts a balanced object out of surrounding junk", () => {
    expect(tolerantParse('prefix {"a":1} suffix').value).toEqual({ a: 1 });
  });
  it("unrepairable -> ok:false with an error", () => {
    const r = tolerantParse("not json at all");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not valid JSON/);
  });
});

describe("headTail — keep the head AND the tail (verdicts live at the end)", () => {
  it("short text is returned unchanged", () => {
    expect(headTail("hello")).toBe("hello");
  });
  it("many lines -> head+tail with an omitted-lines marker", () => {
    const text = Array.from({ length: 200 }, (_, i) => "L" + i).join("\n");
    const out = headTail(text);
    expect(out).toContain("(80 lines omitted)");
    expect(out.startsWith("L0\n")).toBe(true);
    expect(out.endsWith("L199")).toBe(true);
  });
  it("a very long single span -> character truncation marker", () => {
    expect(headTail("x".repeat(9000))).toContain("characters omitted");
  });
});

describe("squashStale — compress old bulky results, keep the recent ones", () => {
  it("squashes an old over-cap tool result; keeps recent intact", () => {
    const history = [
      { role: "system", content: "sys" },
      { role: "tool", content: "A very long tool result\nsecond line of output" },
      { role: "user", content: "recent question" },
    ];
    squashStale(history, { keepRecent: 1, cap: 10 });
    expect(history[1]._squashed).toBe(true);
    expect(history[1].content).toContain("(older result compressed)");
    expect(history[2].content).toBe("recent question");
  });
  it("treats a text-mode '[result of ' user message like a tool result", () => {
    const history = [
      { role: "system", content: "sys" },
      { role: "user", content: "[result of run_bash] " + "x".repeat(50) },
      { role: "user", content: "recent" },
    ];
    squashStale(history, { keepRecent: 1, cap: 10 });
    expect(history[1]._squashed).toBe(true);
  });
  it("leaves short results untouched", () => {
    const history = [
      { role: "system", content: "sys" },
      { role: "tool", content: "short" },
      { role: "user", content: "recent" },
    ];
    squashStale(history, { keepRecent: 1, cap: 10 });
    expect(history[1]._squashed).toBeUndefined();
  });
});

describe("CallGuard — identical-call breaker + per-target failure streaks", () => {
  it("blocks the 3rd identical consecutive call", () => {
    const g = new CallGuard();
    expect(g.repeatBlocked("t", { a: 1 })).toBe(false);
    expect(g.repeatBlocked("t", { a: 1 })).toBe(false);
    expect(g.repeatBlocked("t", { a: 1 })).toBe(true);
  });
  it("a different call resets the repeat counter", () => {
    const g = new CallGuard();
    g.repeatBlocked("t", { a: 1 });
    g.repeatBlocked("t", { a: 1 });
    expect(g.repeatBlocked("t", { a: 2 })).toBe(false);
  });
  it("tracks per-target failure streaks and clears on success", () => {
    const g = new CallGuard();
    g.noteResult("edit", "f.txt", false);
    g.noteResult("edit", "f.txt", false);
    expect(g.failStreak("edit", "f.txt")).toBe(2);
    g.noteResult("edit", "f.txt", true);
    expect(g.failStreak("edit", "f.txt")).toBe(0);
  });
});

describe("ctxWindowFor — context-window heuristic", () => {
  it("a sane exact catalog value wins", () => {
    expect(ctxWindowFor("anything", 50000)).toBe(50000);
  });
  it("ignores an insane exact value (<4096) and falls back", () => {
    expect(ctxWindowFor("totally-unknown", 1000)).toBe(32000);
  });
  it("reads an explicit -128k tag", () => {
    expect(ctxWindowFor("some-128k-model")).toBe(128000);
  });
  it("claude family -> 200000", () => {
    expect(ctxWindowFor("claude-3-5-sonnet")).toBe(200000);
  });
  it("gpt-4o -> 128000", () => {
    expect(ctxWindowFor("gpt-4o")).toBe(128000);
  });
  it("unknown model -> conservative 32000", () => {
    expect(ctxWindowFor("mystery-model")).toBe(32000);
  });
});

describe("parseTextToolCalls — text-mode tool blocks (assistant text only)", () => {
  it("parses one ```tool block and strips it from the text", () => {
    const content = "sure, doing it\n```tool\n{\"name\":\"read_file\",\"args\":{\"path\":\"a.txt\"}}\n```\nthanks";
    const { calls, stripped } = parseTextToolCalls(content);
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe("read_file");
    expect(JSON.parse(calls[0].arguments)).toEqual({ path: "a.txt" });
    expect(stripped).not.toContain("```tool");
  });
  it("caps at 2 tool blocks per reply", () => {
    const b = '```tool\n{"name":"t","args":{}}\n```';
    const { calls } = parseTextToolCalls(b + "\n" + b + "\n" + b);
    expect(calls).toHaveLength(2);
  });
  it("ignores a block whose body is not valid JSON", () => {
    const { calls } = parseTextToolCalls("```tool\nnot json\n```");
    expect(calls).toHaveLength(0);
  });
});
