import type { SearchOptions } from "./types.js";
export interface Candidate {
    title: string;
    url: string;
    content: string;
}
export declare function serperSearch(query: string, opts: SearchOptions): Promise<Candidate[]>;
