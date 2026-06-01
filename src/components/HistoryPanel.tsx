import { useState, useEffect } from 'preact/hooks';
import { loadHistory, clearHistory } from '../lib/history';
import type { HistoryEntry } from '../lib/history';
import styles from '../app.module.css';

interface Props {
  onClose: () => void;
  onRestore: (entry: HistoryEntry) => void;
}

export function HistoryPanel({ onClose, onRestore }: Props) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);

  useEffect(() => { setEntries(loadHistory()); }, []);

  const handleClear = () => {
    if (!confirm('¿Borrar todo el historial?')) return;
    clearHistory();
    setEntries([]);
  };

  const formatTime = (ts: number): string =>
    new Date(ts).toLocaleString('es', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div class={styles.sidePanel} style={{ zIndex: 100 }}>
      {/* Header */}
      <div class={styles.sidePanelHeader}>
        <span class={styles.sidePanelTitle}>🕐 Historial</span>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {entries.length > 0 && (
            <button
              onClick={handleClear}
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

      {entries.length === 0 ? (
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--clr-text-3)', textAlign: 'center', marginTop: '32px' }}>
          El historial está vacío.
        </p>
      ) : (
        <div class={styles.favoriteList}>
          {entries.map((entry) => (
            <div
              key={entry.id}
              class={styles.favoriteCard}
              onClick={() => onRestore(entry)}
              title="Restaurar traducción"
            >
              <div class={styles.favoriteCardMeta}>
                {entry.sourceLang.toUpperCase()} → {entry.targetLang.toUpperCase()} · {formatTime(entry.timestamp)}
              </div>
              <div class={styles.favoriteCardSource}>{entry.sourceText}</div>
              <div class={styles.favoriteCardTranslation}>{entry.translatedText}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
