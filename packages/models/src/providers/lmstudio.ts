import type { LocalModelRuntime, LocalModel, PullProgress, CliRunner, HttpClient, ModelSearchResult, RunningModel, DetectResult } from '../runtime.js';
import { fetchHttp, estimateSizeGB } from '../runtime.js';

export class LmStudioRuntime implements LocalModelRuntime {
  readonly id = 'lmstudio' as const;
  readonly label = 'LM Studio';
  constructor(private cli: CliRunner, private hub: HttpClient) {}

  async detect(): Promise<DetectResult> {
    try { const r = await this.cli.run(['version']); if (r.code === 0) return { available: true, version: r.stdout.trim().split(/\s+/).pop() }; }
    catch { /* fall through */ }
    return { available: false, note: 'LM Studio CLI (lms) not found - install LM Studio, then enable its CLI.' };
  }

  async search(query: string): Promise<ModelSearchResult[]> {
    const q = encodeURIComponent(query.trim());
    const r = await this.hub.json('GET', '/api/models?search=' + q + '&filter=gguf&sort=downloads&direction=-1&limit=25');
    const arr: any[] = Array.isArray(r) ? r : [];
    return arr.map((m) => {
      const id = m.id ?? m.modelId ?? '';
      return { pullName: id, name: id, downloads: m.downloads, sizeGB: estimateSizeGB(id), family: id.split('/')[0], source: 'lmstudio' as const };
    });
  }

  async list(): Promise<LocalModel[]> {
    try {
      const r = await this.cli.run(['ls']);
      return r.stdout.split('\n').map((l) => l.trim()).filter((l) => l && !/^(LLMs|You have|Embedding|MODEL)/i.test(l))
        .map((l) => ({ name: l.split(/\s{2,}|\t/)[0].trim() })).filter((m) => m.name);
    } catch { return []; }
  }

  async running(): Promise<RunningModel[]> {
    try {
      const r = await this.cli.run(['ps']);
      return r.stdout.split('\n').map((l) => l.trim()).filter((l) => l && !/^(MODEL|No models)/i.test(l))
        .map((l) => ({ name: l.split(/\s{2,}|\t/)[0].trim() })).filter((m) => m.name);
    } catch { return []; }
  }

  async pull(name: string, onProgress?: (p: PullProgress) => void): Promise<void> {
    let last = 0;
    for await (const line of this.cli.stream(['get', name, '--yes'])) {
      const pct = /(\d{1,3})\s*%/.exec(line);
      if (pct) last = Math.min(100, parseInt(pct[1], 10));
      onProgress?.({ status: line.trim().slice(0, 80) || 'downloading', completed: last, total: 100, done: /(done|complete|success|finished)/i.test(line) });
    }
    onProgress?.({ status: 'success', completed: 100, total: 100, done: true });
  }

  async remove(name: string): Promise<void> { await this.cli.run(['rm', name, '--yes']); }
  async stop(name: string): Promise<void> { await this.cli.run(['unload', name]); }
  async load(name: string): Promise<void> { await this.cli.run(['load', name]); }

  async browse(): Promise<ModelSearchResult[]> {
    const r = await this.hub.json('GET', '/api/models?filter=gguf&sort=downloads&direction=-1&limit=80');
    const arr: any[] = Array.isArray(r) ? r : [];
    return arr.map((m) => { const id = m.id ?? m.modelId ?? ''; return { pullName: id, name: id, downloads: m.downloads, sizeGB: estimateSizeGB(id), family: id.split('/')[0], source: 'lmstudio' as const }; });
  }
}

export function createLmStudioRuntime(cli: CliRunner, hubBase = 'https://huggingface.co'): LmStudioRuntime {
  return new LmStudioRuntime(cli, fetchHttp(hubBase));
}
