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
    // Only surface a typed-in model if it is ACTUALLY downloadable for local use — verify its registry manifest.
    // (Cloud-only models like glm-5.2 have no downloadable manifest, so they must not appear with a Pull button.)
    if (q && !/:cloud$/i.test(q) && !out.some((r) => r.pullName.toLowerCase() === q.toLowerCase())) {
      const info = await this.manifestInfo(q);
      if (info.ok) out.unshift({ pullName: q, name: q, sizeGB: info.sizeBytes ? Math.round(info.sizeBytes / 1e9 * 10) / 10 : undefined, source: 'ollama' as const });
    }
    return out;
  }

  // Does a typed Ollama model have a real downloadable manifest? 200 = pullable (+ its size); 404 = cloud-only / nonexistent.
  private async manifestInfo(name: string): Promise<{ ok: boolean; sizeBytes?: number }> {
    try {
      const f: any = (globalThis as any).fetch; if (!f) return { ok: false };
      const [pth, tag = 'latest'] = name.split(':');
      const repo = pth.includes('/') ? pth : 'library/' + pth;
      const r = await f('https://registry.ollama.ai/v2/' + repo + '/manifests/' + tag, { headers: { Accept: 'application/vnd.docker.distribution.manifest.v2+json' } });
      if (!r.ok) return { ok: false };
      const m: any = await r.json().catch(() => null);
      const layers: any[] = (m && Array.isArray(m.layers)) ? m.layers : [];
      const model = layers.find((l) => /ollama\.image\.model/.test(l.mediaType || ''));
      const sizeBytes = (model && model.size) || (layers.length ? layers.reduce((sN: number, l: any) => sN + (l.size || 0), 0) : undefined);
      return { ok: true, sizeBytes };
    } catch { return { ok: false }; }
  }

  async list(): Promise<LocalModel[]> {
    const r = await this.http.json('GET', '/api/tags');
    const run = new Set((await this.running().catch(() => [])).map((x) => x.name));
    return (r?.models ?? []).map((m: any) => ({ name: m.name, sizeBytes: m.size, family: m?.details?.family, running: run.has(m.name) }));
  }

  async running(): Promise<RunningModel[]> {
    try {
      const r = await this.http.json('GET', '/api/ps');
      return (r?.models ?? []).map((m: any) => {
        const size = m.size ?? 0, vram = m.size_vram ?? 0;
        const proc = !size ? '' : vram >= size ? '100% GPU' : !vram ? '100% CPU' : `${Math.round((1 - vram / size) * 100)}% CPU / ${Math.round((vram / size) * 100)}% GPU`;
        return { name: m.name, sizeBytes: size, sizeVram: vram, processor: proc, context: m.context_length ?? m.details?.context_length, expiresAt: m.expires_at, family: m.details?.family, params: m.details?.parameter_size, quant: m.details?.quantization_level };
      });
    } catch { return []; }
  }

  async pull(name: string, onProgress?: (p: PullProgress) => void, signal?: AbortSignal): Promise<void> {
    for await (const line of this.http.stream('POST', '/api/pull', { name }, signal)) {
      let o: any; try { o = JSON.parse(line); } catch { continue; }
      onProgress?.({ status: o.status ?? '', completed: o.completed, total: o.total, done: o.status === 'success' });
    }
  }

  async remove(name: string): Promise<void> { await this.http.json('DELETE', '/api/delete', { name }); }

  async stop(name: string): Promise<void> { await this.http.json('POST', '/api/generate', { model: name, keep_alive: 0, stream: false }); }
  async load(name: string, opts?: { numCtx?: number; keepAlive?: string }): Promise<void> { const body: any = { model: name, stream: false }; if (opts?.numCtx) body.options = { num_ctx: opts.numCtx }; if (opts?.keepAlive) body.keep_alive = opts.keepAlive; await this.http.json('POST', '/api/generate', body); }

  async browse(): Promise<ModelSearchResult[]> {
    return OLLAMA_CATALOG.map((m) => ({ pullName: m.name, name: m.name, description: m.description, sizeLabel: m.sizeLabel, sizeGB: m.sizeGB, useCases: m.useCases, family: m.family, source: 'ollama' as const }));
  }
}

export function createOllamaRuntime(baseUrl = 'http://localhost:11434'): OllamaRuntime {
  return new OllamaRuntime(fetchHttp(baseUrl));
}
export const createLocalRuntime = createOllamaRuntime;
