import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
import type { ProjectAdapters, DataFile } from './run.js';

/**
 * Desktop project adapters over the real filesystem (runs in the Electron main process). The model call
 * is INJECTED by the app — this layer only does file I/O, the one thing that genuinely can't be shared.
 */
export function nodeProjectAdapters(askModel: (prompt: string) => Promise<string>, opts: { outputSubdir?: string } = {}): ProjectAdapters {
  return {
    async listFiles(folder: string): Promise<DataFile[]> {
      const out: DataFile[] = [];
      for (const name of await readdir(folder)) {
        const ext = extname(name).toLowerCase();
        if (ext === '.csv') out.push({ name, text: await readFile(join(folder, name), 'utf8') });
        else if (ext === '.xlsx' || ext === '.xls') out.push({ name, bytes: new Uint8Array(await readFile(join(folder, name))) });
      }
      return out;
    },
    askModel,
    async saveOutput(folder: string, name: string, bytes: Uint8Array): Promise<void> {
      const dir = opts.outputSubdir ? join(folder, opts.outputSubdir) : folder;
      if (opts.outputSubdir) await mkdir(dir, { recursive: true });
      await writeFile(join(dir, name), Buffer.from(bytes));
    },
  };
}
