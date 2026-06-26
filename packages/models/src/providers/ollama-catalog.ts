/** Curated catalog of popular Ollama models — Ollama has no public search API, so search() filters this
 *  list and ALSO lets the user pull any name they type. Keep names exactly as Ollama expects them. */
export interface CatalogEntry { name: string; family?: string; sizeLabel?: string; description?: string }

export const OLLAMA_CATALOG: CatalogEntry[] = [
  { name: 'llama3.2', family: 'llama', sizeLabel: '2.0 GB', description: 'Meta Llama 3.2 3B — fast, capable small model' },
  { name: 'llama3.2:1b', family: 'llama', sizeLabel: '1.3 GB', description: 'Llama 3.2 1B — tiny, very fast' },
  { name: 'llama3.1:8b', family: 'llama', sizeLabel: '4.7 GB', description: 'Meta Llama 3.1 8B — strong general model' },
  { name: 'qwen2.5:7b', family: 'qwen', sizeLabel: '4.7 GB', description: 'Alibaba Qwen2.5 7B — strong all-rounder' },
  { name: 'qwen2.5:14b', family: 'qwen', sizeLabel: '9.0 GB', description: 'Qwen2.5 14B — more capable' },
  { name: 'qwen2.5-coder:7b', family: 'qwen', sizeLabel: '4.7 GB', description: 'Qwen2.5 Coder 7B — coding-tuned' },
  { name: 'gemma2:9b', family: 'gemma', sizeLabel: '5.4 GB', description: 'Google Gemma 2 9B' },
  { name: 'gemma2:2b', family: 'gemma', sizeLabel: '1.6 GB', description: 'Gemma 2 2B — small + fast' },
  { name: 'phi3.5', family: 'phi', sizeLabel: '2.2 GB', description: 'Microsoft Phi-3.5 mini' },
  { name: 'mistral', family: 'mistral', sizeLabel: '4.1 GB', description: 'Mistral 7B' },
  { name: 'mistral-nemo', family: 'mistral', sizeLabel: '7.1 GB', description: 'Mistral NeMo 12B' },
  { name: 'deepseek-r1:7b', family: 'deepseek', sizeLabel: '4.7 GB', description: 'DeepSeek-R1 distill 7B — reasoning' },
  { name: 'deepseek-r1:14b', family: 'deepseek', sizeLabel: '9.0 GB', description: 'DeepSeek-R1 distill 14B — stronger reasoning' },
  { name: 'llava:7b', family: 'llava', sizeLabel: '4.7 GB', description: 'LLaVA 7B — vision (image input)' },
  { name: 'nomic-embed-text', family: 'nomic', sizeLabel: '274 MB', description: 'Embeddings model (for RAG)' },
  { name: 'codellama:7b', family: 'llama', sizeLabel: '3.8 GB', description: 'Code Llama 7B — coding' },
];

export function searchCatalog(query: string): CatalogEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return OLLAMA_CATALOG;
  return OLLAMA_CATALOG.filter((m) =>
    m.name.toLowerCase().includes(q) || (m.family || '').toLowerCase().includes(q) || (m.description || '').toLowerCase().includes(q));
}
