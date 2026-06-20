import type { SearchOptions } from "./types.js";
import type { Candidate } from "./serper.js";
export declare function parseDuckduckgo(html: string): Candidate[];
export declare function freeSearch(query: string, opts: SearchOptions): Promise<Candidate[]>;
