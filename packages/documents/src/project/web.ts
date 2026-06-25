import type { ProjectAdapters, DataFile } from './run.js';

/**
 * Web project adapters: uploaded File[] in, a Blob out (the app downloads it or syncs it). The model
 * call is injected. Same pipeline as desktop — only the I/O differs.
 */
export function webProjectAdapters(
  files: File[],
  askModel: (prompt: string) => Promise<string>,
  onOutput: (name: string, blob: Blob) => void,
): ProjectAdapters {
  return {
    async listFiles(): Promise<DataFile[]> {
      const out: DataFile[] = [];
      for (const f of files) {
        const n = f.name.toLowerCase();
        if (n.endsWith('.csv')) out.push({ name: f.name, text: await f.text() });
        else if (n.endsWith('.xlsx') || n.endsWith('.xls')) out.push({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });
      }
      return out;
    },
    askModel,
    async saveOutput(_folder: string, name: string, bytes: Uint8Array): Promise<void> {
      onOutput(name, new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    },
  };
}
