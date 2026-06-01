import type { GlossaryEntry } from './types';

const STORAGE_KEY = 'lingo_glossary';

export function loadGlossary(): GlossaryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as GlossaryEntry[]) : [];
  } catch {
    return [];
  }
}

function saveGlossary(entries: GlossaryEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

/** Agrega o actualiza por (source + sourceLang + targetLang) */
export function upsertEntry(
  entry: Omit<GlossaryEntry, 'id' | 'createdAt' | 'usageCount'>
): GlossaryEntry {
  const entries = loadGlossary();
  const idx = entries.findIndex(
    (e) =>
      e.source.toLowerCase() === entry.source.toLowerCase() &&
      e.sourceLang === entry.sourceLang &&
      e.targetLang === entry.targetLang
  );

  const newEntry: GlossaryEntry = {
    ...entry,
    source: entry.source.toLowerCase().trim(),
    id: idx >= 0 ? entries[idx].id : crypto.randomUUID(),
    createdAt: idx >= 0 ? entries[idx].createdAt : Date.now(),
    usageCount: idx >= 0 ? entries[idx].usageCount : 0,
  };

  if (idx >= 0) entries[idx] = newEntry;
  else entries.push(newEntry);

  saveGlossary(entries);
  return newEntry;
}

export function deleteEntry(id: string): void {
  saveGlossary(loadGlossary().filter((e) => e.id !== id));
}

export function incrementUsage(ids: string[]): void {
  if (ids.length === 0) return;
  const entries = loadGlossary();
  const idSet = new Set(ids);
  for (const e of entries) {
    if (idSet.has(e.id)) e.usageCount++;
  }
  saveGlossary(entries);
}

/**
 * Busca qué entradas del glosario aparecen en el texto.
 * Ordena por priority DESC, luego por longitud DESC
 * (para aplicar frases antes que palabras sueltas).
 */
export function findMatches(
  text: string,
  entries: GlossaryEntry[],
  sourceLang: string,
  targetLang: string
): GlossaryEntry[] {
  return entries
    .filter((e) => e.sourceLang === sourceLang && e.targetLang === targetLang)
    .filter((e) => {
      const escaped = e.source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`\\b${escaped}\\b`, 'i').test(text);
    })
    .sort((a, b) =>
      b.priority !== a.priority
        ? b.priority - a.priority
        : b.source.length - a.source.length
    );
}
