export declare function chunkText(text: string, maxChars?: number): string[];
export declare function lexicalScore(query: string, text: string): number;
export declare function scoreChunks(query: string, chunks: string[]): number[];
export declare function rerankTexts(query: string, texts: string[]): Promise<number[]>;
