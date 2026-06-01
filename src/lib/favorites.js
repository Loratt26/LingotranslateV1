// ── Favorites Store ───────────────────────────────────────────────────────────
const FAVORITES_KEY = 'lingo_favorites';
const MAX_FAVORITES = 100;
export function loadFavorites() {
    try {
        const raw = localStorage.getItem(FAVORITES_KEY);
        return raw ? JSON.parse(raw) : [];
    }
    catch {
        return [];
    }
}
export function addFavorite(entry) {
    const favorites = loadFavorites();
    const newEntry = {
        ...entry,
        id: crypto.randomUUID(),
        timestamp: Date.now(),
    };
    const updated = [newEntry, ...favorites].slice(0, MAX_FAVORITES);
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(updated));
    return newEntry;
}
export function removeFavorite(id) {
    const favorites = loadFavorites().filter((f) => f.id !== id);
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
}
export function clearFavorites() {
    localStorage.removeItem(FAVORITES_KEY);
}
