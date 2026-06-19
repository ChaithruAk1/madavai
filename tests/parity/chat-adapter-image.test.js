import { describe, it, expect } from "vitest";
import { makeChatAdapter } from "../../core/chat-adapter.js";

// ADR-0001 / M2c.2 — create_image image-card parity. execLeaf may return { output, image }; the adapter
// puts the image on the tool_result UI event (so the picture renders on the core path, like the legacy
// loops) while returning only the text to the model loop. Plain string returns are unaffected.
describe("chat adapter — execLeaf { output, image } -> tool_result carries the image", () => {
  it("forwards the image on tool_result, returns only text to the loop", async () => {
    const ipc = [];
    const adapter = makeChatAdapter({
      execLeaf: async () => ({ output: "Image generated.", image: "data:image/png;base64,AAAA" }),
      ui: (kind, data) => ipc.push({ kind, data }), isAuto: () => true,
    });
    const ret = await adapter.runTool("create_image", { prompt: "a cat" }, { id: "c1" });
    expect(ret).toBe("Image generated."); // the model sees text only
    const result = ipc.find((e) => e.kind === "tool_result");
    expect(result.data.output).toBe("Image generated.");
    expect(result.data.image).toBe("data:image/png;base64,AAAA");
  });

  it("a plain string return has no image key (no regression)", async () => {
    const ipc = [];
    const adapter = makeChatAdapter({
      execLeaf: async () => "just text",
      ui: (kind, data) => ipc.push({ kind, data }), isAuto: () => true,
    });
    await adapter.runTool("web_search", { query: "x" }, { id: "c2" });
    const result = ipc.find((e) => e.kind === "tool_result");
    expect(result.data.output).toBe("just text");
    expect("image" in result.data).toBe(false);
  });
});
