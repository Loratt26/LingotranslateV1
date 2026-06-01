const STORAGE_KEY = 'lingo_history';
const MAX_HISTORY = 50;
export function addToHistory(entry) {
    const history = loadHistory();
    // Avoid consecutive duplicates (same source text + langs)
    if (history[0]?.sourceText === entry.sourceText &&
        history[0]?.sourceLang === entry.sourceLang &&
        history[0]?.targetLang === entry.targetLang)
        return;
    history.unshift({ ...entry, id: crypto.randomUUID(), timestamp: Date.now() });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
}
export function loadHistory() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    }
    catch {
        return [];
    }
}
export function clearHistory() {
    localStorage.removeItem(STORAGE_KEY);
}
