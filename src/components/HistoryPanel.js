import { jsx as _jsx, jsxs as _jsxs } from "preact/jsx-runtime";
import { useState, useEffect } from 'preact/hooks';
import { loadHistory, clearHistory } from '../lib/history';
import styles from '../app.module.css';
export function HistoryPanel({ onClose, onRestore }) {
    const [entries, setEntries] = useState([]);
    useEffect(() => { setEntries(loadHistory()); }, []);
    const handleClear = () => {
        if (!confirm('¿Borrar todo el historial?'))
            return;
        clearHistory();
        setEntries([]);
    };
    const formatTime = (ts) => new Date(ts).toLocaleString('es', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    return (_jsxs("div", { class: styles.sidePanel, style: { zIndex: 100 }, children: [_jsxs("div", { class: styles.sidePanelHeader, children: [_jsx("span", { class: styles.sidePanelTitle, children: "\uD83D\uDD50 Historial" }), _jsxs("div", { style: { display: 'flex', gap: '8px', alignItems: 'center' }, children: [entries.length > 0 && (_jsx("button", { onClick: handleClear, style: { fontSize: 'var(--text-xs)', color: 'var(--clr-error)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)' }, children: "Borrar todo" })), _jsx("button", { onClick: onClose, style: { background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: 'var(--clr-text-3)', lineHeight: 1 }, children: "\u00D7" })] })] }), entries.length === 0 ? (_jsx("p", { style: { fontSize: 'var(--text-sm)', color: 'var(--clr-text-3)', textAlign: 'center', marginTop: '32px' }, children: "El historial est\u00E1 vac\u00EDo." })) : (_jsx("div", { class: styles.favoriteList, children: entries.map((entry) => (_jsxs("div", { class: styles.favoriteCard, onClick: () => onRestore(entry), title: "Restaurar traducci\u00F3n", children: [_jsxs("div", { class: styles.favoriteCardMeta, children: [entry.sourceLang.toUpperCase(), " \u2192 ", entry.targetLang.toUpperCase(), " \u00B7 ", formatTime(entry.timestamp)] }), _jsx("div", { class: styles.favoriteCardSource, children: entry.sourceText }), _jsx("div", { class: styles.favoriteCardTranslation, children: entry.translatedText })] }, entry.id))) }))] }));
}
