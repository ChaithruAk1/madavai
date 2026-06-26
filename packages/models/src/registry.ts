import { createOllamaRuntime } from './providers/ollama.js';
import { createHuggingFaceRuntime } from './providers/huggingface.js';
import { createLmStudioRuntime } from './providers/lmstudio.js';
import type { LocalModelRuntime, CliRunner, RuntimeId } from './runtime.js';

export interface RegistryOptions {
  ollamaBase?: string;
  hfBase?: string;
  lmsCli?: CliRunner;
}

export function createRuntimes(opts: RegistryOptions = {}): Partial<Record<RuntimeId, LocalModelRuntime>> {
  const ollama = createOllamaRuntime(opts.ollamaBase);
  const huggingface = createHuggingFaceRuntime(ollama, opts.hfBase);
  const reg: Partial<Record<RuntimeId, LocalModelRuntime>> = { ollama, huggingface };
  if (opts.lmsCli) reg.lmstudio = createLmStudioRuntime(opts.lmsCli, opts.hfBase);
  return reg;
}
