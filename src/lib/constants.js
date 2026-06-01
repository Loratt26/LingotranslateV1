export const DEBOUNCE_MS = 150;
export const ALTERNATIVES_IDLE_DELAY_MS = 650;
export const STREAM_RENDER_THROTTLE_MS = 40;
export const MIN_CHARS_TO_TRANSLATE = 3;
export const MAX_CHARS_PER_REQUEST = 5000;
export const SUPPORTED_LANGUAGES = [
    { code: 'auto', name: 'Detectar idioma' },
    { code: 'es', name: 'EspaÃ±ol' },
    { code: 'en', name: 'InglÃ©s' },
    { code: 'fr', name: 'FrancÃ©s' },
    { code: 'it', name: 'Italiano' },
    { code: 'de', name: 'AlemÃ¡n' },
    { code: 'pt', name: 'PortuguÃ©s (Portugal)' },
    { code: 'pt-BR', name: 'PortuguÃ©s (Brasil)' },
    { code: 'nl', name: 'NeerlandÃ©s (HolandÃ©s)' },
    { code: 'sv', name: 'Sueco' },
    { code: 'ar', name: 'Ãrabe (Ø§Ù„Ø¹Ø±Ø¨ÙŠØ©)' },
    { code: 'ko', name: 'Coreano (í•œêµ­ì–´)' },
    { code: 'ja', name: 'JaponÃ©s (æ—¥æœ¬èªž)' },
    { code: 'zh-CN', name: 'Chino Simplificado (ç®€ä½“ä¸­æ–‡)' },
    { code: 'zh-TW', name: 'Chino Tradicional (ç¹é«”ä¸­æ–‡)' },
    { code: 'cs', name: 'Checo' },
    { code: 'fi', name: 'FinlandÃ©s' },
    { code: 'el', name: 'Griego (Î•Î»Î»Î·Î½Î¹ÎºÎ¬)' },
    { code: 'pl', name: 'Polaco' },
    { code: 'ru', name: 'Ruso (Ð ÑƒÑÑÐºÐ¸Ð¹)' },
    { code: 'tr', name: 'Turco' },
];
/** Map code â†’ full display name (useful for system prompt context) */
export function getLanguageName(code) {
    const entry = SUPPORTED_LANGUAGES.find((l) => l.code === code);
    // Strip native script in parens for the system prompt
    return entry ? entry.name.replace(/\s*\(.*\)$/, '') : code;
}
