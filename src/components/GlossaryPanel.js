import { jsxs as _jsxs, jsx as _jsx } from "preact/jsx-runtime";
import { useState, useEffect } from 'preact/hooks';
import { loadGlossary, upsertEntry, deleteEntry } from '../lib/glossary';
import { SUPPORTED_LANGUAGES } from '../lib/constants';
export function GlossaryPanel({ onClose, sourceLang, targetLang }) {
    const [entries, setEntries] = useState([]);
    const [source, setSource] = useState('');
    const [target, setTarget] = useState('');
    const [context, setContext] = useState('');
    const [saved, setSaved] = useState(false);
    useEffect(() => { setEntries(loadGlossary()); }, []);
    const filtered = entries.filter((e) => e.sourceLang === sourceLang && e.targetLang === targetLang);
    const langName = (c) => SUPPORTED_LANGUAGES.find((l) => l.code === c)?.name ?? c.toUpperCase();
    const handleAdd = () => {
        if (!source.trim() || !target.trim())
            return;
        upsertEntry({ source: source.trim(), target: target.trim(), context: context.trim() || undefined, sourceLang, targetLang, priority: 8 });
        setEntries(loadGlossary());
        setSource('');
        setTarget('');
        setContext('');
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };
    const handleDelete = (id) => { deleteEntry(id); setEntries(loadGlossary()); };
    const handleExport = () => {
        const all = loadGlossary();
        const json = JSON.stringify({ version: 1, entries: all }, null, 2);
        const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `lingo-glossary-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };
    const handleImport = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async () => {
            const file = input.files?.[0];
            if (!file)
                return;
            try {
                const text = await file.text();
                const data = JSON.parse(text);
                if (!Array.isArray(data.entries))
                    throw new Error('Formato inválido');
                for (const entry of data.entries)
                    upsertEntry(entry);
                setEntries(loadGlossary());
                alert(`✓ ${data.entries.length} entradas importadas`);
            }
            catch (err) {
                alert(`Error importando: ${err.message}`);
            }
        };
        input.click();
    };
    const btnStyle = {
        padding: '4px 10px', border: '1px solid var(--clr-divider)', borderRadius: 'var(--r-sm)',
        background: 'var(--clr-bg)', color: 'var(--clr-text-2)', fontSize: 'var(--text-xs)',
        fontWeight: 'var(--fw-500)', cursor: 'pointer', fontFamily: 'var(--font)',
    };
    const inputStyle = {
        padding: '7px 10px', border: '1px solid var(--clr-divider)', borderRadius: 'var(--r-sm)',
        fontSize: 'var(--text-sm)', background: 'var(--clr-bg-subtle)', color: 'var(--clr-text-1)',
        fontFamily: 'var(--font)', outline: 'none',
    };
    return (_jsxs("div", { style: {
            position: 'fixed', top: '58px', right: '0',
            width: '420px', height: 'calc(100vh - 58px)',
            background: 'var(--clr-bg)', borderLeft: '1px solid var(--clr-divider)',
            padding: '24px', boxShadow: 'var(--shadow-lg)', zIndex: 100,
            overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px',
        }, children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }, children: [_jsxs("span", { style: { fontSize: 'var(--text-lg)', fontWeight: 'var(--fw-600)', color: 'var(--clr-text-1)' }, children: ["Glosario \u2014 ", langName(sourceLang), " \u2192 ", langName(targetLang)] }), _jsxs("div", { style: { display: 'flex', gap: '6px', alignItems: 'center' }, children: [_jsx("button", { onClick: handleExport, style: btnStyle, title: "Exportar como JSON", children: "\u2193 Export" }), _jsx("button", { onClick: handleImport, style: btnStyle, title: "Importar desde JSON", children: "\u2191 Import" }), _jsx("button", { onClick: onClose, style: { ...btnStyle, border: 'none', fontSize: '20px', color: 'var(--clr-text-3)', padding: '0 4px' }, children: "\u00D7" })] })] }), _jsxs("div", { style: { padding: '16px', background: 'var(--clr-bg-subtle)', borderRadius: 'var(--r-md)', border: '1px solid var(--clr-divider)' }, children: [_jsx("p", { style: { fontSize: 'var(--text-xs)', fontWeight: 'var(--fw-500)', color: 'var(--clr-text-3)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }, children: "Nueva entrada" }), _jsxs("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }, children: [_jsx("input", { value: source, onInput: (e) => setSource(e.target.value), placeholder: `Original (${langName(sourceLang)})`, style: inputStyle }), _jsx("input", { value: target, onInput: (e) => setTarget(e.target.value), placeholder: `Traducción (${langName(targetLang)})`, style: inputStyle })] }), _jsx("input", { value: context, onInput: (e) => setContext(e.target.value), placeholder: "Contexto (opcional)", style: { ...inputStyle, width: '100%', marginBottom: '10px', boxSizing: 'border-box' } }), _jsx("button", { onClick: handleAdd, disabled: !source.trim() || !target.trim(), style: { padding: '8px 16px', background: 'var(--clr-accent)', color: '#fff', border: 'none', borderRadius: 'var(--r-sm)', fontSize: 'var(--text-sm)', cursor: 'pointer', opacity: !source.trim() || !target.trim() ? '0.5' : '1', fontFamily: 'var(--font)' }, children: saved ? '✓ Guardado' : '+ Agregar' })] }), _jsx("div", { style: { flex: '1' }, children: filtered.length === 0 ? (_jsxs("p", { style: { fontSize: 'var(--text-sm)', color: 'var(--clr-text-3)', textAlign: 'center', marginTop: '24px' }, children: ["No hay entradas para ", langName(sourceLang), " \u2192 ", langName(targetLang), ".", _jsx("br", {}), "Agrega la primera arriba."] })) : filtered.map((entry) => (_jsxs("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', border: '1px solid var(--clr-divider)', borderRadius: 'var(--r-sm)', marginBottom: '8px', fontSize: 'var(--text-sm)', background: 'var(--clr-bg)' }, children: [_jsxs("div", { children: [_jsx("strong", { style: { color: 'var(--clr-text-1)' }, children: entry.source }), _jsx("span", { style: { color: 'var(--clr-text-3)', margin: '0 6px' }, children: "\u2192" }), _jsx("span", { style: { color: 'var(--clr-text-1)' }, children: entry.target }), entry.context && _jsx("span", { style: { display: 'block', fontSize: 'var(--text-xs)', color: 'var(--clr-text-3)', marginTop: '2px' }, children: entry.context }), _jsxs("span", { style: { display: 'block', fontSize: 'var(--text-2xs)', color: 'var(--clr-text-3)', marginTop: '1px' }, children: ["Usos: ", entry.usageCount] })] }), _jsx("button", { onClick: () => handleDelete(entry.id), style: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-text-3)', fontSize: '16px', padding: '0 4px' }, title: "Eliminar", children: "\u00D7" })] }, entry.id))) })] }));
}
