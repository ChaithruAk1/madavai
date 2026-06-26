import type { LocalModelRuntime, LocalModel, PullProgress, HttpClient, ModelSearchResult, RunningModel, DetectResult } from '../runtime.js';
import { fetchHttp } from '../runtime.js';
import { searchCatalog, OLLAMA_CATALOG } from './ollama-catalog.js';

export class OllamaRuntime implements LocalModelRuntime {
  readonly id = 'ollama' as const;
  readonly label = 'Ollama';
  constructor(private http: HttpClient) {}

  async detect(): Promise<DetectResult> {
    try { const v = await this.http.json('GET', '/api/version'); return { available: true, version: v?.version }; }
    catch { return { available: false, note: 'Ollama not detected - install it to pull and run local models.' }; }
  }

  async search(query: string): Promise<ModelSearchResult[]> {
    const out: ModelSearchResult[] = searchCatalog(query).map((m) => ({
      pullName: m.name, name: m.name, description: m.description, sizeLabel: m.sizeLabel, family: m.family, source: 'ollama' as const,
    }));
    const q = query.trim();
    if (q && !out.some((r) => r.pullName.toLowerCase() === q.toLowerCase())) {
      out.unshift({ pullName: q, name: q + '  -  pull as typed', source: 'ollama' });
    }
    return out;
  }

  async list(): Promise<LocalModel[]> {
    const r = await this.http.json('GET', '/api/tags');
    const run = new Set((await this.running().catch(() => [])).map((x) => x.name));
    return (r?.models ?? []).map((m: any) => ({ name: m.name, sizeBytes: m.size, family: m?.details?.family, running: run.has(m.name) }));
  }

  async running(): Promise<RunningModel[]> {
    try { const r = await this.http.json('GET', '/api/ps'); return (r?.models ?? []).map((m: any) => ({ name: m.name, sizeBytes: m.size })); }
    catch { return []; }
  }

  async pull(name: string, onProgress?: (p: PullProgress) => void): Promise<void> {
    for await (const line of this.http.stream('POST', '/api/pull', { name })) {
      let o: any; try { o = JSON.parse(line); } catch { continue; }
      onProgress?.({ status: o.status ?? '', completed: o.completed, total: o.total, done: o.status === 'success' });
    }
  }

  async remove(name: string): Promise<void> { await this.http.json('DELETE', '/api/delete', { name }); }

  async stop(name: string): Promise<void> { await this.http.json('POST', '/api/generate', { model: name, keep_alive: 0, stream: false }); }

  async browse(): Promise<ModelSearchResult[]> {
    return OLLAMA_CATALOG.map((m) => ({ pullName: m.name, name: m.name, description: m.description, sizeLabel: m.sizeLabel, sizeGB: m.sizeGB, useCases: m.useCases, family: m.family, source: 'ollama' as const }));
  }
}

export function createOllamaRuntime(baseUrl = 'http://localhost:11434'): OllamaRuntime {
  return new OllamaRuntime(fetchHttp(baseUrl));
}
export const createLocalRuntime = createOllamaRuntime;
