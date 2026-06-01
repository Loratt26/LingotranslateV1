export const DEFAULT_OPENAI_MODEL = 'gpt-5.4-mini';

export const OPENAI_MODELS = [
  {
    id: 'auto',
    label: 'Auto',
    detail: 'Recomendado, router decide',
    inputPerMillion: null,
    outputPerMillion: null,
  },
  {
    id: 'gpt-5.4-mini',
    label: 'GPT 5.4 Mini',
    detail: 'Rapido y preciso',
    inputPerMillion: null,
    outputPerMillion: null,
  },
  {
    id: 'claude-haiku-4.5',
    label: 'Claude Haiku 4.5',
    detail: 'Muy rapido',
    inputPerMillion: null,
    outputPerMillion: null,
  },
  {
    id: 'minimax-m2.1',
    label: 'MiniMax M2.1',
    detail: 'Rapido',
    inputPerMillion: null,
    outputPerMillion: null,
  },
  {
    id: 'minimax-m2.5',
    label: 'MiniMax M2.5',
    detail: 'Rapido, mejor calidad',
    inputPerMillion: null,
    outputPerMillion: null,
  },
  {
    id: 'gpt-5.4',
    label: 'GPT 5.4',
    detail: 'Balance calidad/velocidad',
    inputPerMillion: null,
    outputPerMillion: null,
  },
  {
    id: 'claude-sonnet-4',
    label: 'Claude Sonnet 4',
    detail: 'Balanceado',
    inputPerMillion: null,
    outputPerMillion: null,
  },
  {
    id: 'claude-sonnet-4.5',
    label: 'Claude Sonnet 4.5',
    detail: 'Balanceado, mas fino',
    inputPerMillion: null,
    outputPerMillion: null,
  },
  {
    id: 'claude-sonnet-4.6',
    label: 'Claude Sonnet 4.6',
    detail: 'Alta calidad',
    inputPerMillion: null,
    outputPerMillion: null,
  },
  {
    id: 'gpt-5.5',
    label: 'GPT 5.5',
    detail: 'Maxima calidad GPT',
    inputPerMillion: null,
    outputPerMillion: null,
  },
  {
    id: 'gpt-5.2',
    label: 'GPT 5.2',
    detail: 'Estable',
    inputPerMillion: null,
    outputPerMillion: null,
  },
  {
    id: 'gpt-5.2-codex',
    label: 'GPT 5.2 Codex',
    detail: 'Codigo y tecnico',
    inputPerMillion: null,
    outputPerMillion: null,
  },
  {
    id: 'gpt-5.3-codex',
    label: 'GPT 5.3 Codex',
    detail: 'Codigo avanzado',
    inputPerMillion: null,
    outputPerMillion: null,
  },
  {
    id: 'claude-opus-4.5',
    label: 'Claude Opus 4.5',
    detail: 'Maxima calidad',
    inputPerMillion: null,
    outputPerMillion: null,
  },
  {
    id: 'claude-opus-4.6',
    label: 'Claude Opus 4.6',
    detail: 'Maxima calidad',
    inputPerMillion: null,
    outputPerMillion: null,
  },
  {
    id: 'claude-opus-4.7',
    label: 'Claude Opus 4.7',
    detail: 'Maxima calidad',
    inputPerMillion: null,
    outputPerMillion: null,
  },
  {
    id: 'deepseek-3.2',
    label: 'DeepSeek 3.2',
    detail: 'Razonamiento/tecnico',
    inputPerMillion: null,
    outputPerMillion: null,
  },
  {
    id: 'qwen3-coder-next',
    label: 'Qwen3 Coder Next',
    detail: 'Codigo',
    inputPerMillion: null,
    outputPerMillion: null,
  },
  {
    id: 'glm-5',
    label: 'GLM5',
    detail: 'General',
    inputPerMillion: null,
    outputPerMillion: null,
  },
] as const;

export type OpenAIModelId = typeof OPENAI_MODELS[number]['id'];

export function isOpenAIModelId(value: string): value is OpenAIModelId {
  return OPENAI_MODELS.some((model) => model.id === value);
}

export function getOpenAIModelOption(modelId: string) {
  return OPENAI_MODELS.find((model) => model.id === modelId) ?? OPENAI_MODELS[0];
}
