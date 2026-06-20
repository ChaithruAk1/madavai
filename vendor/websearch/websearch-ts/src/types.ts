// Tavily-shaped types (camelCase, matching the Tavily JS SDK) so migration is a find-and-replace.
export interface SearchOptions {
  searchDepth?: "basic" | "advanced";
  maxResults?: number;
  topic?: "general" | "news";
  includeAnswer?: boolean;
  includeRawContent?: boolean;
  includeDomains?: string[];
  excludeDomains?: string[];
  timeRange?: "day" | "week" | "month" | "year" | null;
}
export interface SearchResultItem {
  title: string;
  url: string;
  content: string;
  score: number;
  rawContent?: string | null;
}
export interface SearchResponse {
  query: string;
  answer?: string | null;
  results: SearchResultItem[];
  responseTime: number;
}
export interface Usage {
  month: string;
  budgetUsd: number;
  spentUsd: number;
  remainingUsd: number;
  paidCalls: number;
  freeCalls: number;
}
