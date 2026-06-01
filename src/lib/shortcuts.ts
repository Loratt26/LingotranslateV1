export type ShortcutAction = 'focus' | 'clear' | 'copy' | 'swap';

export function registerShortcuts(
  map: Partial<Record<ShortcutAction, () => void>>
): () => void {
  const listener = (e: KeyboardEvent) => {
    // Skip when typing in inputs/textareas (except Alt combos)
    const tag = (e.target as HTMLElement).tagName;
    const inField = tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT';

    // Alt+T — focus source textarea
    if (e.altKey && e.key === 't') { e.preventDefault(); map.focus?.(); return; }
    // Alt+C — copy translation
    if (e.altKey && e.key === 'c') { e.preventDefault(); map.copy?.(); return; }
    // Alt+S — swap languages
    if (e.altKey && e.key === 's') { e.preventDefault(); map.swap?.(); return; }
    // Escape — clear (only when not typing in a field without Alt)
    if (e.key === 'Escape' && !e.altKey && !inField) { map.clear?.(); }
  };

  document.addEventListener('keydown', listener);
  return () => document.removeEventListener('keydown', listener);
}
