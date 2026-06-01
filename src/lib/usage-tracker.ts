import { DEFAULT_OPENAI_MODEL, getOpenAIModelOption } from './model-options';

const STORAGE_KEY = 'lingo_usage';

interface UsageData {
  monthKey: string;
  inputTokens: number;
  outputTokens: number;
  requestCount: number;
}

function getCurrentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function recordUsage(inputTokens: number, outputTokens: number): void {
  const monthKey = getCurrentMonthKey();
  const raw = localStorage.getItem(STORAGE_KEY);
  let data: UsageData = raw
    ? (JSON.parse(raw) as UsageData)
    : { monthKey, inputTokens: 0, outputTokens: 0, requestCount: 0 };

  if (data.monthKey !== monthKey) {
    data = { monthKey, inputTokens: 0, outputTokens: 0, requestCount: 0 };
  }

  data.inputTokens  += inputTokens;
  data.outputTokens += outputTokens;
  data.requestCount += 1;

  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function getUsage(): UsageData {
  const monthKey = getCurrentMonthKey();
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { monthKey, inputTokens: 0, outputTokens: 0, requestCount: 0 };
  const data = JSON.parse(raw) as UsageData;
  return data.monthKey === monthKey
    ? data
    : { monthKey, inputTokens: 0, outputTokens: 0, requestCount: 0 };
}

/** Estimated USD cost using the selected OpenAI model rates. */
export function estimateCost(
  data: ReturnType<typeof getUsage>,
  model = DEFAULT_OPENAI_MODEL,
): number | null {
  const rates = getOpenAIModelOption(model);
  if (rates.inputPerMillion === null || rates.outputPerMillion === null) return null;
  return (data.inputTokens / 1_000_000) * rates.inputPerMillion +
    (data.outputTokens / 1_000_000) * rates.outputPerMillion;
}
