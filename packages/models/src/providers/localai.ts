import type { LocalModelRuntime, LocalModel, PullProgress, HttpClient, ModelSearchResult, RunningModel, DetectResult } from '../runtime.js';
import { fetchHttp } from '../runtime.js';

// Map a LocalAI gallery entry to one of our browse "useCases" so media models slot into the goal tiles.
function galleryUseCases(m: any): string[] {
  const hay = ((m.name || '') + ' ' + (m.description || '') + ' ' + (Array.isArray(m.tags) ? m.tags.join(' ') : '')).toLowerCase();
  const out: string[] = [];
  if (/(text-?to-?image|stable-?diffusion|sdxl|\bflux\b|diffus|\bimage\b)/.test(hay)) out.push('image');
  if (/(\btts\b|text-?to-?speech|\bvoice\b|\bspeech\b|bark|piper|xtts|whisper|transcrib|\bstt\b|\basr\b)/.test(hay)) out.push('voice');
  if (/(text-?to-?video|\bvideo\b|\bwan\b|hunyuan|\bltx\b|cogvideo|mochi)/.test(hay)) out.push('video');
  if (!out.length) out.push('general');
  return out;
}

// One open-source engine (LocalAI) that serves image, voice and video over the OpenAI-compatible API. Model
// install is async: POST /models/apply returns a job uuid; we poll /models/jobs/{uuid} for progress.
export class LocalAiRuntime implements LocalModelRuntime {
  readonly id = 'localai' as const;
  readonly label = 'LocalAI';
  constructor(private http: HttpClient, private base = 'http://localhost:8080') {}

  async detect(): Promise<DetectResult> {
    const NOTE = 'Image, voice and video from one local engine (OpenAI-compatible).';
    try { await this.http.json('GET', '/readyz'); return { available: true, note: NOTE }; }
    catch {
      try { await this.http.json('GET', '/v1/models'); return { available: true, note: NOTE }; }
      catch { return { available: false, note: 'LocalAI not reachable — start its container to generate images, voice and video.' }; }
    }
  }

  async browse(): Promise<ModelSearchResult[]> {
    let arr: any[] = [];
    try { const r = await this.http.json('GET', '/models/available'); arr = Array.isArray(r) ? r : []; } catch { arr = []; }
    return arr.slice(0, 200).map((m) => ({
      pullName: m.name, name: m.name, description: m.description,
      useCases: galleryUseCases(m), family: (m.gallery && m.gallery.name) || undefined,
      source: 'localai' as const,
    }));
  }

  async search(query: string): Promise<ModelSearchResult[]> {
    const all = await this.browse();
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((m) => (m.name + ' ' + (m.description || '')).toLowerCase().includes(q));
  }

  async list(): Promise<LocalModel[]> {
    try { const r = await this.http.json('GET', '/v1/models'); return ((r && r.data) || []).map((m: any) => ({ name: m.id })); }
    catch { return []; }
  }
  async running(): Promise<RunningModel[]> { return []; } // LocalAI loads/unloads backends on demand

  async pull(name: string, onProgress?: (p: PullProgress) => void): Promise<void> {
    const j = await this.http.json('POST', '/models/apply', { id: name });
    const uuid = j && (j.uuid || j.id);
    if (!uuid) throw new Error('LocalAI did not return a job id for the install');
    for (let i = 0; i < 3000; i++) {            // ~60 min ceiling at 1.2s/poll for large media models
      let s: any; try { s = await this.http.json('GET', '/models/jobs/' + uuid); } catch { await sleep(1200); continue; }
      if (s && s.error) throw new Error(String(s.error));
      const pct = typeof s.progress === 'number' ? Math.round(s.progress) : 0;
      const done = !!(s && s.processed) || /done|complete|success/i.test((s && (s.message || s.status)) || '');
      onProgress?.({ status: (s && (s.message || (s.file_name ? 'downloading ' + s.file_name : 'installing'))) || 'installing', completed: pct, total: 100, done });
      if (done) return;
      await sleep(1200);
    }
  }

  async remove(name: string): Promise<void> { try { await this.http.json('POST', '/models/delete/' + encodeURIComponent(name), {}); } catch { /* best-effort */ } }

  // Media generation (OpenAI-compatible). Returns base64 so the desktop can show + save it.
  async generateImage(model: string, prompt: string, opts?: { size?: string }): Promise<{ b64: string; mime: string }> {
    const body = { model, prompt: String(prompt).slice(0, 4000), size: (opts && opts.size) || '512x512', n: 1, response_format: 'b64_json' };
    const r = await this.http.json('POST', '/v1/images/generations', body);
    const d = (r && r.data && r.data[0]) || {};
    if (d.b64_json) return { b64: d.b64_json, mime: 'image/png' };
    if (d.url) {
      const f: any = (globalThis as any).fetch;
      const u = /^https?:/i.test(d.url) ? d.url : (this.base.replace(/\/+$/, '') + (d.url.startsWith('/') ? '' : '/') + d.url);
      const resp = await f(u); const buf = Buffer.from(await resp.arrayBuffer());
      return { b64: buf.toString('base64'), mime: resp.headers.get('content-type') || 'image/png' };
    }
    throw new Error('LocalAI returned no image');
  }

  // Text-to-speech (OpenAI-compatible /v1/audio/speech). Returns base64 audio.
  async generateSpeech(model: string, input: string, opts?: { voice?: string; format?: string }): Promise<{ b64: string; mime: string }> {
    const f: any = (globalThis as any).fetch;
    const body: any = { model, input: String(input).slice(0, 4000) };
    if (opts && opts.voice) body.voice = opts.voice;
    if (opts && opts.format) body.response_format = opts.format;
    const r = await f(this.base.replace(/\/+$/, '') + '/v1/audio/speech', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error('Speech failed (HTTP ' + r.status + ')');
    const buf = Buffer.from(await r.arrayBuffer());
    return { b64: buf.toString('base64'), mime: r.headers.get('content-type') || 'audio/wav' };
  }

  // Text-to-music (LocalAI /tts with a MusicGen-style model). Returns base64 audio.
  async generateMusic(model: string, input: string): Promise<{ b64: string; mime: string }> {
    const f: any = (globalThis as any).fetch;
    const r = await f(this.base.replace(/\/+$/, '') + '/tts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model, input: String(input).slice(0, 2000) }) });
    if (!r.ok) throw new Error('Music failed (HTTP ' + r.status + ')');
    const buf = Buffer.from(await r.arrayBuffer());
    return { b64: buf.toString('base64'), mime: r.headers.get('content-type') || 'audio/wav' };
  }

  // Speech-to-text (OpenAI-compatible /v1/audio/transcriptions, multipart). Returns the transcript text.
  async transcribe(model: string, audioB64: string, mime: string, filename: string): Promise<{ text: string }> {
    const f: any = (globalThis as any).fetch;
    const FD: any = (globalThis as any).FormData;
    const B: any = (globalThis as any).Blob;
    const fd = new FD();
    fd.append('model', model);
    fd.append('file', new B([Buffer.from(audioB64, 'base64')], { type: mime || 'audio/wav' }), filename || 'audio.wav');
    const r = await f(this.base.replace(/\/+$/, '') + '/v1/audio/transcriptions', { method: 'POST', body: fd });
    if (!r.ok) throw new Error('Transcription failed (HTTP ' + r.status + ')');
    const j = await r.json().catch(() => ({}));
    return { text: (j && j.text) || '' };
  }

  // Text-to-video (LocalAI /video). Heavy + slow on most hardware; returns base64 video. Returns a URL that
  // we fetch + base64-encode (or b64_json directly).
  async generateVideo(model: string, prompt: string, opts?: { width?: number; height?: number; seconds?: number; startImage?: string }): Promise<{ b64: string; mime: string }> {
    const f: any = (globalThis as any).fetch;
    const body: any = { model, prompt: String(prompt).slice(0, 4000) };
    if (opts && opts.width) body.width = opts.width;
    if (opts && opts.height) body.height = opts.height;
    if (opts && opts.seconds) body.seconds = opts.seconds;
    if (opts && opts.startImage) body.start_image = opts.startImage;
    const r = await this.http.json('POST', '/video', body);
    const d = (r && r.data && r.data[0]) || {};
    if (d.b64_json) return { b64: d.b64_json, mime: 'video/mp4' };
    if (d.url) {
      const u = /^https?:/i.test(d.url) ? d.url : (this.base.replace(/\/+$/, '') + (d.url.startsWith('/') ? '' : '/') + d.url);
      const resp = await f(u); const buf = Buffer.from(await resp.arrayBuffer());
      return { b64: buf.toString('base64'), mime: resp.headers.get('content-type') || 'video/mp4' };
    }
    throw new Error('LocalAI returned no video');
  }

  // Edit an existing image from an instruction (img2img) via OpenAI-compatible /v1/images/edits (multipart).
  async editImage(model: string, prompt: string, srcB64: string, srcMime: string, opts?: { size?: string }): Promise<{ b64: string; mime: string }> {
    const f: any = (globalThis as any).fetch;
    const FD: any = (globalThis as any).FormData;
    const B: any = (globalThis as any).Blob;
    const fd = new FD();
    fd.append('model', model);
    fd.append('prompt', String(prompt).slice(0, 4000));
    fd.append('image', new B([Buffer.from(srcB64, 'base64')], { type: srcMime || 'image/png' }), 'source.png');
    fd.append('response_format', 'b64_json');
    fd.append('n', '1');
    if (opts && opts.size) fd.append('size', opts.size);
    const r = await f(this.base.replace(/\/+$/, '') + '/v1/images/edits', { method: 'POST', body: fd });
    if (!r.ok) throw new Error('Image edit failed (HTTP ' + r.status + ')');
    const j = await r.json().catch(() => ({}));
    const d = (j && j.data && j.data[0]) || {};
    if (d.b64_json) return { b64: d.b64_json, mime: 'image/png' };
    if (d.url) { const u = /^https?:/i.test(d.url) ? d.url : (this.base.replace(/\/+$/, '') + (d.url.startsWith('/') ? '' : '/') + d.url); const resp = await f(u); const buf = Buffer.from(await resp.arrayBuffer()); return { b64: buf.toString('base64'), mime: resp.headers.get('content-type') || 'image/png' }; }
    throw new Error('LocalAI returned no edited image');
  }

  // Vision — describe / answer a question about an image (image-text-to-text) via /v1/chat/completions.
  async describeImage(model: string, prompt: string, imageB64: string, imageMime: string): Promise<{ text: string }> {
    const dataUrl = 'data:' + (imageMime || 'image/png') + ';base64,' + imageB64;
    const body = { model, max_tokens: 1024, messages: [{ role: 'user', content: [{ type: 'text', text: String(prompt || 'Describe this image in detail.').slice(0, 2000) }, { type: 'image_url', image_url: { url: dataUrl } }] }] };
    const r = await this.http.json('POST', '/v1/chat/completions', body);
    const c = r && r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content;
    const text = typeof c === 'string' ? c : (Array.isArray(c) ? c.map((x: any) => (x && x.text) || '').join('') : '');
    return { text };
  }
  async stop(_name: string): Promise<void> { /* no per-model unload endpoint; LocalAI idles backends itself */ }
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

export function createLocalAiRuntime(baseUrl = 'http://localhost:8080'): LocalAiRuntime {
  return new LocalAiRuntime(fetchHttp(baseUrl), baseUrl);
}
