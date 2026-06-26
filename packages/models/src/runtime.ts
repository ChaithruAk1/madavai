/** A local model runtime running on the user's hardware. First-class so Madav never depends on cloud models. */
export interface LocalModel { name: string; sizeBytes?: number; family?: string; running?: boolean }
export interface PullProgress { status: string; completed?: number; total?: number; done: boolean }
export type RuntimeId = 'ollama' | 'huggingface' | 'lmstudio' | 'localai';

export interface ModelSearchResult {
  pullName: string;
  name: string;
  description?: string;
  sizeLabel?: string;
  downloads?: number;
  family?: string;
  sizeGB?: number;          // approx download / memory footprint, for the 'fits your machine' estimate
  useCases?: string[];      // 'general' | 'coding' | 'reasoning' | 'vision' | 'tiny' | 'embed'
  source: RuntimeId;
}
export interface RunningModel { name: string; sizeBytes?: number }
export interface DetectResult { available: boolean; version?: string; note?: string }

export interface LocalModelRuntime {
  readonly id: RuntimeId;
  readonly label: string;
  detect(): Promise<DetectResult>;
  search(query: string): Promise<ModelSearchResult[]>;
  list(): Promise<LocalModel[]>;
  running(): Promise<RunningModel[]>;
  pull(name: string, onProgress?: (p: PullProgress) => void): Promise<void>;
  remove(name: string): Promise<void>;
  stop(name: string): Promise<void>;  // unload a running model from memory
  load?(name: string): Promise<void>;  // load a model into memory (so it actually runs)
  browse(): Promise<ModelSearchResult[]>;  // a default gallery to show before the user searches
}

export interface HttpClient {
  json(method: string, path: string, body?: unknown): Promise<any>;
  stream(method: string, path: string, body?: unknown): AsyncIterable<string>;
}

export interface CliRunner {
  run(args: string[]): Promise<{ code: number; stdout: string; stderr: string }>;
  stream(args: string[]): AsyncIterable<string>;
}

export function fetchHttp(baseUrl: string): HttpClient {
  const f: any = (globalThis as any).fetch;
  return {
    async json(method, path, body) {
      const r = await f(baseUrl + path, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    },
    async *stream(method, path, body) {
      const r = await f(baseUrl + path, { method, body: body ? JSON.stringify(body) : undefined });
      if (!r.ok || !r.body) throw new Error('HTTP ' + r.status);
      const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = '';
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1); if (line) yield line; }
      }
      if (buf.trim()) yield buf.trim();
    },
  };
}

/** Rough GGUF size (GB) from a param count in a model id ("...-7B-..." -> ~4.2). Q4-ish: ~0.6 GB per B params.
 *  Used only for the "fits your machine" hint when a real size isn't known (e.g. HuggingFace listings). */
export function estimateSizeGB(id: string): number | undefined {
  const m = /(\d+(?:\.\d+)?)\s*b\b/i.exec(String(id).toLowerCase());
  if (!m) return undefined;
  const b = parseFloat(m[1]);
  if (!isFinite(b) || b <= 0) return undefined;
  return Math.round(b * 0.6 * 10) / 10;
}
