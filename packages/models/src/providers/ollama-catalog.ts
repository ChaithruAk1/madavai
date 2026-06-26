/** Curated catalog of popular Ollama models — Ollama has no public search API, so search() filters this
 *  list (and lets the user pull any name they type) and browse() renders it as a goal-organized gallery.
 *  Keep names EXACTLY as Ollama expects them. sizeGB is the approximate download / memory footprint (Q4),
 *  used only for the "fits your machine" estimate, so rough is fine. */
export type UseCase = 'general' | 'coding' | 'reasoning' | 'vision' | 'tiny' | 'embed';
export interface CatalogEntry { name: string; family?: string; sizeLabel?: string; sizeGB?: number; description?: string; useCases?: UseCase[] }

export const OLLAMA_CATALOG: CatalogEntry[] = [
  // General-purpose chat
  { name: 'llama3.2', family: 'llama', sizeLabel: '2.0 GB', sizeGB: 2.0, useCases: ['general', 'tiny'], description: 'Meta Llama 3.2 3B — fast, capable everyday chat' },
  { name: 'llama3.1:8b', family: 'llama', sizeLabel: '4.7 GB', sizeGB: 4.7, useCases: ['general'], description: 'Meta Llama 3.1 8B — strong, well-rounded' },
  { name: 'qwen2.5:7b', family: 'qwen', sizeLabel: '4.7 GB', sizeGB: 4.7, useCases: ['general'], description: 'Qwen2.5 7B — excellent all-rounder' },
  { name: 'qwen2.5:14b', family: 'qwen', sizeLabel: '9.0 GB', sizeGB: 9.0, useCases: ['general'], description: 'Qwen2.5 14B — more capable, more memory' },
  { name: 'gemma2:9b', family: 'gemma', sizeLabel: '5.4 GB', sizeGB: 5.4, useCases: ['general'], description: 'Google Gemma 2 9B — polished general chat' },
  { name: 'mistral', family: 'mistral', sizeLabel: '4.1 GB', sizeGB: 4.1, useCases: ['general'], description: 'Mistral 7B — classic and reliable' },
  { name: 'mistral-nemo', family: 'mistral', sizeLabel: '7.1 GB', sizeGB: 7.1, useCases: ['general'], description: 'Mistral NeMo 12B — long context, tool use' },
  // Coding
  { name: 'qwen2.5-coder:7b', family: 'qwen', sizeLabel: '4.7 GB', sizeGB: 4.7, useCases: ['coding'], description: 'Qwen2.5 Coder 7B — top open coding model' },
  { name: 'qwen2.5-coder:1.5b', family: 'qwen', sizeLabel: '1.0 GB', sizeGB: 1.0, useCases: ['coding', 'tiny'], description: 'Qwen2.5 Coder 1.5B — tiny coding helper' },
  { name: 'qwen2.5-coder:32b', family: 'qwen', sizeLabel: '20 GB', sizeGB: 20, useCases: ['coding'], description: 'Qwen2.5 Coder 32B — strongest, big machine' },
  { name: 'codellama:7b', family: 'llama', sizeLabel: '3.8 GB', sizeGB: 3.8, useCases: ['coding'], description: 'Code Llama 7B — Meta coding model' },
  { name: 'deepseek-coder-v2:16b', family: 'deepseek', sizeLabel: '8.9 GB', sizeGB: 8.9, useCases: ['coding'], description: 'DeepSeek-Coder V2 16B — strong coding' },
  // Reasoning
  { name: 'deepseek-r1:7b', family: 'deepseek', sizeLabel: '4.7 GB', sizeGB: 4.7, useCases: ['reasoning'], description: 'DeepSeek-R1 7B — shows its working' },
  { name: 'deepseek-r1:14b', family: 'deepseek', sizeLabel: '9.0 GB', sizeGB: 9.0, useCases: ['reasoning'], description: 'DeepSeek-R1 14B — stronger reasoning' },
  { name: 'deepseek-r1:32b', family: 'deepseek', sizeLabel: '20 GB', sizeGB: 20, useCases: ['reasoning'], description: 'DeepSeek-R1 32B — deep reasoning, big machine' },
  { name: 'qwq', family: 'qwen', sizeLabel: '20 GB', sizeGB: 20, useCases: ['reasoning'], description: 'QwQ 32B — reasoning specialist' },
  // Vision (image input)
  { name: 'llama3.2-vision:11b', family: 'llama', sizeLabel: '7.9 GB', sizeGB: 7.9, useCases: ['vision'], description: 'Llama 3.2 Vision 11B — understands images' },
  { name: 'llava:7b', family: 'llava', sizeLabel: '4.7 GB', sizeGB: 4.7, useCases: ['vision'], description: 'LLaVA 7B — lightweight image understanding' },
  { name: 'minicpm-v', family: 'minicpm', sizeLabel: '5.5 GB', sizeGB: 5.5, useCases: ['vision'], description: 'MiniCPM-V — capable, efficient vision' },
  // Tiny & fast
  { name: 'llama3.2:1b', family: 'llama', sizeLabel: '1.3 GB', sizeGB: 1.3, useCases: ['tiny', 'general'], description: 'Llama 3.2 1B — tiny, very fast' },
  { name: 'gemma2:2b', family: 'gemma', sizeLabel: '1.6 GB', sizeGB: 1.6, useCases: ['tiny', 'general'], description: 'Gemma 2 2B — small and snappy' },
  { name: 'qwen2.5:0.5b', family: 'qwen', sizeLabel: '0.4 GB', sizeGB: 0.4, useCases: ['tiny'], description: 'Qwen2.5 0.5B — ultra-light' },
  { name: 'phi3.5', family: 'phi', sizeLabel: '2.2 GB', sizeGB: 2.2, useCases: ['tiny', 'general'], description: 'Microsoft Phi-3.5 mini — small but smart' },
  // Embeddings (not a chat model — powers RAG/search)
  { name: 'nomic-embed-text', family: 'nomic', sizeLabel: '0.3 GB', sizeGB: 0.27, useCases: ['embed'], description: 'Embeddings model — powers search/RAG, not chat' },
];

export function searchCatalog(query: string): CatalogEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return OLLAMA_CATALOG;
  return OLLAMA_CATALOG.filter((m) =>
    m.name.toLowerCase().includes(q) || (m.family || '').toLowerCase().includes(q) || (m.description || '').toLowerCase().includes(q));
}
