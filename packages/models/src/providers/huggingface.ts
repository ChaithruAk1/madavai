import type { LocalModelRuntime, LocalModel, PullProgress, HttpClient, ModelSearchResult, RunningModel, DetectResult } from '../runtime.js';
import { fetchHttp, estimateSizeGB } from '../runtime.js';
import { OllamaRuntime } from './ollama.js';

export class HuggingFaceRuntime implements LocalModelRuntime {
  readonly id = 'huggingface' as const;
  readonly label = 'HuggingFace';
  constructor(private hub: HttpClient, private ollama: OllamaRuntime) {}

  async detect(): Promise<DetectResult> {
    const o = await this.ollama.detect();
    if (!o.available) return { available: false, note: 'HuggingFace models run via Ollama - install/start Ollama to use them.' };
    try { await this.hub.json('GET', '/api/models?limit=1'); return { available: true, version: o.version, note: 'GGUF models pulled + run via Ollama.' }; }
    catch { return { available: false, note: 'Could not reach HuggingFace.' }; }
  }

  async search(query: string): Promise<ModelSearchResult[]> {
    const q = encodeURIComponent(query.trim());
    const r = await this.hub.json('GET', '/api/models?search=' + q + '&filter=gguf&sort=downloads&direction=-1&limit=25');
    const arr: any[] = Array.isArray(r) ? r : [];
    return arr.map((m) => {
      const id = m.id ?? m.modelId ?? '';
      const tags: string[] = Array.isArray(m.tags) ? m.tags : [];
      return {
        pullName: 'hf.co/' + id,
        name: id,
        downloads: m.downloads,
        description: tags.filter((t) => !/^(gguf|region:|license:|arxiv:|dataset:)/.test(t)).slice(0, 4).join(' · '),
        family: id.split('/')[0],
        sizeGB: estimateSizeGB(id),
        source: 'huggingface' as const,
      };
    });
  }

  async list(): Promise<LocalModel[]> {
    return (await this.ollama.list()).filter((m) => /(^|[/])hf\.co[/]/i.test(m.name));
  }
  async running(): Promise<RunningModel[]> {
    return (await this.ollama.running()).filter((m) => /hf\.co[/]/i.test(m.name));
  }

  async pull(name: string, onProgress?: (p: PullProgress) => void): Promise<void> {
    const repo = name.replace(/^https?:\/\/huggingface\.co\//i, '').replace(/^hf\.co\//i, '');
    return this.ollama.pull('hf.co/' + repo, onProgress);
  }
  async remove(name: string): Promise<void> { return this.ollama.remove(name); }
  async stop(name: string): Promise<void> { return this.ollama.stop(name); }
  async load(name: string, opts?: { numCtx?: number; keepAlive?: string }): Promise<void> { return this.ollama.load(name, opts); }

  async browse(): Promise<ModelSearchResult[]> {
    const r = await this.hub.json('GET', '/api/models?filter=gguf&sort=downloads&direction=-1&limit=100');
    const arr: any[] = Array.isArray(r) ? r : [];
    return arr.map((m) => { const id = m.id ?? m.modelId ?? ''; return { pullName: 'hf.co/' + id, name: id, downloads: m.downloads, sizeGB: estimateSizeGB(id), family: id.split('/')[0], source: 'huggingface' as const }; });
  }
}

export function createHuggingFaceRuntime(ollama: OllamaRuntime, hubBase = 'https://huggingface.co'): HuggingFaceRuntime {
  return new HuggingFaceRuntime(fetchHttp(hubBase), ollama);
}
