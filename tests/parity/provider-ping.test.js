import { describe, it, expect } from "vitest";
import { resolveProviderOnline } from "../../src/bridge/providerPing.js";

const yes = async () => true, no = async () => false, tok = () => true, notok = () => false;

describe("resolveProviderOnline — online/offline chip (CORS-aware)", () => {
  it("online when the direct ping succeeds (proxy not consulted)", async () => {
    let proxied = false;
    const r = await resolveProviderOnline({ directPing: yes, hasToken: tok, proxyModels: async () => { proxied = true; return {}; } });
    expect(r).toBe(true); expect(proxied).toBe(false);
  });
  it("offline when direct fails and the user is not signed in (no proxy available)", async () => {
    expect(await resolveProviderOnline({ directPing: no, hasToken: notok, proxyModels: async () => ({ data: [] }) })).toBe(false);
  });
  it("ONLINE when direct fails but the server proxy reaches the provider (the CORS bug being fixed)", async () => {
    expect(await resolveProviderOnline({ directPing: no, hasToken: tok, proxyModels: async () => ({ data: [{ id: "gpt" }] }) })).toBe(true);
  });
  it("offline when the proxy returns a provider error (e.g. bad key)", async () => {
    expect(await resolveProviderOnline({ directPing: no, hasToken: tok, proxyModels: async () => ({ error: "invalid key" }) })).toBe(false);
  });
  it("offline when the proxy call throws (unreachable / 403 / 5xx)", async () => {
    expect(await resolveProviderOnline({ directPing: no, hasToken: tok, proxyModels: async () => { throw new Error("403"); } })).toBe(false);
  });
  it("a throwing direct ping falls through to the proxy", async () => {
    expect(await resolveProviderOnline({ directPing: async () => { throw new Error("net"); }, hasToken: tok, proxyModels: async () => ({ data: [1] }) })).toBe(true);
  });
});
