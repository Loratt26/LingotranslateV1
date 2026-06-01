import { DEFAULT_OPENAI_MODEL, getOpenAIModelOption } from './model-options';
const STORAGE_KEY = 'lingo_usage';
function getCurrentMonthKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
export function recordUsage(inputTokens, outputTokens) {
    const monthKey = getCurrentMonthKey();
    const raw = localStorage.getItem(STORAGE_KEY);
    let data = raw
        ? JSON.parse(raw)
        : { monthKey, inputTokens: 0, outputTokens: 0, requestCount: 0 };
    if (data.monthKey !== monthKey) {
        data = { monthKey, inputTokens: 0, outputTokens: 0, requestCount: 0 };
    }
    data.inputTokens += inputTokens;
    data.outputTokens += outputTokens;
    data.requestCount += 1;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
export function getUsage() {
    const monthKey = getCurrentMonthKey();
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw)
        return { monthKey, inputTokens: 0, outputTokens: 0, requestCount: 0 };
    const data = JSON.parse(raw);
    return data.monthKey === monthKey
        ? data
        : { monthKey, inputTokens: 0, outputTokens: 0, requestCount: 0 };
}
/** Estimated USD cost using the selected OpenAI model rates. */
export function estimateCost(data, model = DEFAULT_OPENAI_MODEL) {
    const rates = getOpenAIModelOption(model);
    if (rates.inputPerMillion === null || rates.outputPerMillion === null)
        return null;
    return (data.inputTokens / 1000000) * rates.inputPerMillion +
        (data.outputTokens / 1000000) * rates.outputPerMillion;
}
