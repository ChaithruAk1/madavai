import { search } from "./engine.js";
import { usage, setBudget, setBudgetMode } from "./budget.js";
export { search } from "./engine.js";
export { usage, setBudget, setBudgetMode } from "./budget.js";
/**
 * Drop-in-ish replacement for the Tavily JS SDK:
 *   const tvly = createWebSearch();
 *   const res = await tvly.search("query", { searchDepth: "advanced", maxResults: 5 });
 *   console.log(await tvly.usage());          // spend so far
 *   tvly.setBudget(1000);                      // raise the limit anytime
 */
export function createWebSearch() {
    return { search, usage, setBudget, setBudgetMode };
}
export default createWebSearch;
