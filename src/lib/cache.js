const TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_ENTRIES = 300;
// Map preserves insertion order — oldest entry is first (LRU eviction)
const cache = new Map();
function makeKey(text, sourceLang, targetLang, variant = '') {
    return `${sourceLang}|||${targetLang}|||${variant}|||${text}`;
}
export function cacheGet(text, sourceLang, targetLang, variant = '') {
    const key = makeKey(text, sourceLang, targetLang, variant);
    const entry = cache.get(key);
    if (!entry)
        return null;
    if (Date.now() - entry.timestamp > TTL_MS) {
        cache.delete(key);
        return null;
    }
    // LRU: re-insert at end to mark as most recently used
    cache.delete(key);
    cache.set(key, entry);
    return entry;
}
export function cacheSet(text, sourceLang, targetLang, variant, translation, alternatives) {
    const key = makeKey(text, sourceLang, targetLang, variant);
    cache.delete(key); // remove first so re-insert goes to end
    if (cache.size >= MAX_ENTRIES) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined)
            cache.delete(oldest);
    }
    cache.set(key, { translation, alternatives, timestamp: Date.now() });
}
export function cacheSize() { return cache.size; }
export function cacheClear() { cache.clear(); }
