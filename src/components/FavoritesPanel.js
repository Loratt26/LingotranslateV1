import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "preact/jsx-runtime";
import { useState, useEffect, useRef } from 'preact/hooks';
import { loadFavorites, removeFavorite, clearFavorites } from '../lib/favorites';
import styles from '../app.module.css';
export function FavoritesPanel({ onClose, onRestore }) {
    const [entries, setEntries] = useState([]);
    const [search, setSearch] = useState('');
    const panelRef = useRef(null);
    useEffect(() => { setEntries(loadFavorites()); }, []);
    const handleRemove = (id, e) => {
        e.stopPropagation();
        if (!confirm('¿Eliminar este favorito?'))
            return;
        removeFavorite(id);
        setEntries(loadFavorites());
    };
    const handleClearAll = () => {
        if (!confirm('¿Eliminar todos los favoritos?'))
            return;
        clearFavorites();
        setEntries([]);
    };
    const formatTime = (ts) => new Date(ts).toLocaleString('es', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const filtered = search.trim()
        ? entries.filter((e) => e.name.toLowerCase().includes(search.toLowerCase()) ||
            e.sourceText.toLowerCase().includes(search.toLowerCase()))
        : entries;
    return (_jsxs("div", { ref: panelRef, class: styles.sidePanel, style: { zIndex: 101 }, children: [_jsxs("div", { class: styles.sidePanelHeader, children: [_jsx("span", { class: styles.sidePanelTitle, children: "\u2605 Favoritos" }), _jsxs("div", { style: { display: 'flex', gap: '8px', alignItems: 'center' }, children: [entries.length > 0 && (_jsx("button", { onClick: handleClearAll, style: { fontSize: 'var(--text-xs)', color: 'var(--clr-error)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)' }, children: "Borrar todo" })), _jsx("button", { onClick: onClose, style: { background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: 'var(--clr-text-3)', lineHeight: 1 }, children: "\u00D7" })] })] }), entries.length > 3 && (_jsx("input", { class: styles.favoriteSearch, type: "text", placeholder: "Buscar favoritos\u2026", value: search, onInput: (e) => setSearch(e.target.value) })), filtered.length === 0 ? (_jsx("p", { style: { fontSize: 'var(--text-sm)', color: 'var(--clr-text-3)', textAlign: 'center', marginTop: '32px', lineHeight: 1.7 }, children: entries.length === 0
                    ? _jsxs(_Fragment, { children: ["No tienes favoritos a\u00FAn.", _jsx("br", {}), "Pulsa \u2605 para guardar."] })
                    : 'Sin resultados.' })) : (_jsx("div", { class: styles.favoriteList, children: filtered.map((entry) => (_jsxs("div", { class: styles.favoriteCard, onClick: () => onRestore(entry), title: "Restaurar traducci\u00F3n", children: [_jsxs("div", { class: styles.favoriteCardTop, children: [_jsx("span", { class: styles.favoriteName, children: entry.name }), _jsx("button", { class: styles.favoriteRemoveBtn, onClick: (e) => handleRemove(entry.id, e), title: "Eliminar favorito", children: "\u00D7" })] }), _jsxs("div", { class: styles.favoriteCardMeta, children: [entry.sourceLang.toUpperCase(), " \u2192 ", entry.targetLang.toUpperCase(), entry.tone && entry.tone !== 'neutral' && _jsxs(_Fragment, { children: [" \u00B7 ", entry.tone] }), entry.context && entry.context !== 'general' && _jsxs(_Fragment, { children: [" \u00B7 ", entry.context] })] }), _jsx("div", { class: styles.favoriteCardSource, children: entry.sourceText }), _jsx("div", { class: styles.favoriteCardTranslation, children: entry.translatedText }), _jsx("div", { class: styles.favoriteCardTime, children: formatTime(entry.timestamp) })] }, entry.id))) }))] }));
}
