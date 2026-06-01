// ── Favorites Store ───────────────────────────────────────────────────────────

const FAVORITES_KEY = 'lingo_favorites';
const MAX_FAVORITES = 100;

export interface FavoriteEntry {
  id: string;
  name: string;            // user-defined label
  sourceText: string;
  translatedText: string;
  sourceLang: string;
  targetLang: string;
  tone: string;
  context: string;
  timestamp: number;
}

export function loadFavorites(): FavoriteEntry[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    return raw ? (JSON.parse(raw) as FavoriteEntry[]) : [];
  } catch { return []; }
}

export function addFavorite(entry: Omit<FavoriteEntry, 'id' | 'timestamp'>): FavoriteEntry {
  const favorites = loadFavorites();
  const newEntry: FavoriteEntry = {
    ...entry,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
  };
  const updated = [newEntry, ...favorites].slice(0, MAX_FAVORITES);
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(updated));
  return newEntry;
}

export function removeFavorite(id: string): void {
  const favorites = loadFavorites().filter((f) => f.id !== id);
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
}

export function clearFavorites(): void {
  localStorage.removeItem(FAVORITES_KEY);
}
