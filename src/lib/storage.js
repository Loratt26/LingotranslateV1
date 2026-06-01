import { DEFAULT_OPENAI_MODEL, isOpenAIModelId } from './model-options';
const KEYS = {
    API_KEY: 'lingo_api_key',
    SOURCE_LANG: 'lingo_source_lang',
    TARGET_LANG: 'lingo_target_lang',
    PROXY_URL: 'lingo_proxy_url',
    CONTEXT: 'lingo_context',
    OPENAI_MODEL: 'lingo_openai_model',
};
export const storage = {
    getApiKey: () => localStorage.getItem(KEYS.API_KEY) ?? '',
    setApiKey: (key) => localStorage.setItem(KEYS.API_KEY, key),
    getSourceLang: () => localStorage.getItem(KEYS.SOURCE_LANG) ?? 'auto',
    setSourceLang: (lang) => localStorage.setItem(KEYS.SOURCE_LANG, lang),
    getTargetLang: () => localStorage.getItem(KEYS.TARGET_LANG) ?? 'en',
    setTargetLang: (lang) => localStorage.setItem(KEYS.TARGET_LANG, lang),
    getProxyUrl: () => localStorage.getItem(KEYS.PROXY_URL) ?? '',
    setProxyUrl: (url) => localStorage.setItem(KEYS.PROXY_URL, url),
    getOpenAIModel: () => {
        const model = localStorage.getItem(KEYS.OPENAI_MODEL) ?? DEFAULT_OPENAI_MODEL;
        return isOpenAIModelId(model) ? model : DEFAULT_OPENAI_MODEL;
    },
    setOpenAIModel: (model) => localStorage.setItem(KEYS.OPENAI_MODEL, model),
    getContext: () => localStorage.getItem(KEYS.CONTEXT) ?? 'general',
    setContext: (ctx) => localStorage.setItem(KEYS.CONTEXT, ctx),
};
