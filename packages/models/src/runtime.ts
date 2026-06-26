/** A local model runtime running on the user's hardware. First-class so Madav never depends on cloud models. */
export interface LocalModel { name: string; sizeBytes?: number; family?: string; running?: boolean }
export interface PullProgress { status: string; completed?: number; total?: number; done: boolean }
export type RuntimeId = 'ollama' | 'huggingface' | 'lmstudio';

export interface ModelSearchResult {
  pullName: string;
  name: string;
  description?: string;
  sizeLabel?: string;
  downloads?: number;
  family?: string;
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
