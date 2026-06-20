import type { Usage } from "./types.js";
export type BudgetMode = "soft" | "hard";
export declare function currentSpend(): Promise<number>;
export declare function canSpend(cost: number): Promise<boolean>;
export declare function recordPaid(cost: number): Promise<void>;
export declare function recordFree(): Promise<void>;
export declare function usage(): Promise<Usage & {
    mode: BudgetMode;
    overBudget: boolean;
}>;
export declare function setBudget(usd: number): void;
export declare function setBudgetMode(mode: BudgetMode): void;
