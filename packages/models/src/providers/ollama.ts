import type { LocalModelRuntime, LocalModel, PullProgress, HttpClient } from '../runtime.js';
import { fetchHttp } from '../runtime.js';

/** Local-runtime integration (one provider behind the generic interface). */
export class OllamaRuntime implements LocalModelRuntime {
  constructor(private http: HttpClient) {}
  async detect() {
    try { const v = await this.http.json('GET', '/api/version'); return { available: true, version: v?.version }; }
    catch { return { available: false }; }
  }
  async list(): Promise<LocalModel[]> {
    const r = await this.http.json('GET', '/api/tags');
    return (r?.models ?? []).map((m: any) => ({ name: m.name, sizeBytes: m.size, family: m?.details?.family }));
  }
  async pull(name: string, onProgress?: (p: PullProgress) => void): Promise<void> {
    for await (const line of this.http.stream('POST', '/api/pull', { name })) {
      let o: any; try { o = JSON.parse(line); } catch { continue; }
      onProgress?.({ status: o.status ?? '', completed: o.completed, total: o.total, done: o.status === 'success' });
    }
  }
  async remove(name: string): Promise<void> { await this.http.json('DELETE', '/api/delete', { name }); }
}

export function createLocalRuntime(baseUrl = 'http://localhost:11434'): LocalModelRuntime {
  return new OllamaRuntime(fetchHttp(baseUrl));
}
