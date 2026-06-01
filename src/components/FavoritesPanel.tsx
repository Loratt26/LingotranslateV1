import { useState, useEffect, useRef } from 'preact/hooks';
import { loadFavorites, removeFavorite, clearFavorites } from '../lib/favorites';
import type { FavoriteEntry } from '../lib/favorites';
import styles from '../app.module.css';

interface Props {
  onClose: () => void;
  onRestore: (entry: FavoriteEntry) => void;
}

export function FavoritesPanel({ onClose, onRestore }: Props) {
  const [entries, setEntries] = useState<FavoriteEntry[]>([]);
  const [search, setSearch] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setEntries(loadFavorites()); }, []);

  const handleRemove = (id: string, e: MouseEvent) => {
    e.stopPropagation();
    if (!confirm('¿Eliminar este favorito?')) return;
    removeFavorite(id);
    setEntries(loadFavorites());
  };

  const handleClearAll = () => {
    if (!confirm('¿Eliminar todos los favoritos?')) return;
    clearFavorites();
    setEntries([]);
  };

  const formatTime = (ts: number): string =>
    new Date(ts).toLocaleString('es', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const filtered = search.trim()
    ? entries.filter((e) =>
        e.name.toLowerCase().includes(search.toLowerCase()) ||
        e.sourceText.toLowerCase().includes(search.toLowerCase()))
    : entries;

  return (
    <div
      ref={panelRef}
      class={styles.sidePanel}
      style={{ zIndex: 101 }}
    >
      {/* Header */}
      <div class={styles.sidePanelHeader}>
        <span class={styles.sidePanelTitle}>★ Favoritos</span>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {entries.length > 0 && (
            <button
              onClick={handleClearAll}
              style={{ fontSize: 'var(--text-xs)', color: 'var(--clr-error)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)' }}
            >
              Borrar todo
            </button>
          )}
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: 'var(--clr-text-3)', lineHeight: 1 }}
          >
            ×
          </button>
        </div>
      </div>

      {/* Search */}
      {entries.length > 3 && (
        <input
          class={styles.favoriteSearch}
          type="text"
          placeholder="Buscar favoritos…"
          value={search}
          onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
        />
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--clr-text-3)', textAlign: 'center', marginTop: '32px', lineHeight: 1.7 }}>
          {entries.length === 0
            ? <>No tienes favoritos aún.<br />Pulsa ★ para guardar.</>
            : 'Sin resultados.'}
        </p>
      ) : (
        <div class={styles.favoriteList}>
          {filtered.map((entry) => (
            <div
              key={entry.id}
              class={styles.favoriteCard}
              onClick={() => onRestore(entry)}
              title="Restaurar traducción"
            >
              <div class={styles.favoriteCardTop}>
                <span class={styles.favoriteName}>{entry.name}</span>
                <button
                  class={styles.favoriteRemoveBtn}
                  onClick={(e) => handleRemove(entry.id, e as MouseEvent)}
                  title="Eliminar favorito"
                >
                  ×
                </button>
              </div>
              <div class={styles.favoriteCardMeta}>
                {entry.sourceLang.toUpperCase()} → {entry.targetLang.toUpperCase()}
                {entry.tone && entry.tone !== 'neutral' && <> · {entry.tone}</>}
                {entry.context && entry.context !== 'general' && <> · {entry.context}</>}
              </div>
              <div class={styles.favoriteCardSource}>{entry.sourceText}</div>
              <div class={styles.favoriteCardTranslation}>{entry.translatedText}</div>
              <div class={styles.favoriteCardTime}>{formatTime(entry.timestamp)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
