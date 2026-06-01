import { jsx as _jsx, jsxs as _jsxs } from "preact/jsx-runtime";
import { useState } from 'preact/hooks';
import { storage } from '../lib/storage';
import { getUsage, estimateCost } from '../lib/usage-tracker';
import { OPENAI_MODELS } from '../lib/model-options';
export function SettingsPanel({ onClose }) {
    const [accessToken, setAccessToken] = useState(storage.getApiKey());
    const [proxyUrl, setProxyUrl] = useState(storage.getProxyUrl());
    const [model, setModel] = useState(storage.getOpenAIModel());
    const [saved, setSaved] = useState(false);
    const usage = getUsage();
    const cost = estimateCost(usage, model);
    const normalizedProxyUrl = proxyUrl.trim();
    const isCustomEndpoint = normalizedProxyUrl.length > 0;
    const handleSave = () => {
        storage.setApiKey(accessToken.trim());
        storage.setProxyUrl(normalizedProxyUrl === '/api/openai' ? '' : normalizedProxyUrl);
        storage.setOpenAIModel(model);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };
    const s = {
        panel: {
            position: 'fixed', top: '58px', right: '0',
            width: '380px', height: 'calc(100vh - 58px)',
            background: 'var(--clr-bg)', borderLeft: '1px solid var(--clr-divider)',
            padding: '24px', boxShadow: 'var(--shadow-lg)', zIndex: '100',
            overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0',
        },
        label: {
            display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--fw-500)',
            color: 'var(--clr-text-3)', marginBottom: '5px',
            textTransform: 'uppercase', letterSpacing: '0.5px',
        },
        input: {
            width: '100%', padding: '8px 12px', boxSizing: 'border-box',
            border: '1px solid var(--clr-divider)', borderRadius: 'var(--r-sm)',
            fontSize: 'var(--text-md)', background: 'var(--clr-bg-subtle)',
            color: 'var(--clr-text-1)', fontFamily: 'var(--font)', outline: 'none',
        },
        hint: {
            fontSize: 'var(--text-xs)', color: 'var(--clr-text-3)', marginTop: '5px', lineHeight: '1.5',
        },
        sep: { margin: '18px 0', border: 'none', borderTop: '1px solid var(--clr-divider)' },
        sectionLabel: {
            fontSize: 'var(--text-xs)', fontWeight: 'var(--fw-500)', color: 'var(--clr-text-3)',
            textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px', display: 'block',
        },
        statRow: { fontSize: 'var(--text-sm)', color: 'var(--clr-text-2)', lineHeight: '2' },
    };
    return (_jsxs("div", { style: s.panel, children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '22px' }, children: [_jsx("span", { style: { fontSize: 'var(--text-lg)', fontWeight: 'var(--fw-600)', color: 'var(--clr-text-1)' }, children: "Configuracion" }), _jsx("button", { onClick: onClose, style: { background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: 'var(--clr-text-3)' }, children: "x" })] }), _jsx("label", { style: s.label, children: "Modelo OpenAI" }), _jsx("select", { value: model, onInput: (e) => setModel(e.target.value), style: { ...s.input, marginBottom: '6px' }, children: OPENAI_MODELS.map((option) => (_jsxs("option", { value: option.id, children: [option.label, " - ", option.detail] }, option.id))) }), _jsx("p", { style: s.hint, children: "Nano reduce costo. Mini conserva mas matiz cuando el texto es largo o tecnico." }), _jsx("hr", { style: { ...s.sep, margin: '14px 0' } }), _jsx("label", { style: s.label, children: "Endpoint del proxy" }), _jsx("input", { type: "url", value: proxyUrl, onInput: (e) => setProxyUrl(e.target.value), placeholder: "/api/openai", style: { ...s.input, marginBottom: '6px' } }), _jsx("p", { style: s.hint, children: isCustomEndpoint
                    ? 'Usando un proxy personalizado local. Solo se admiten rutas /api/...'
                    : 'Deja este campo vacio para usar el proxy seguro de Vercel. La API key queda solo en el servidor.' }), _jsx("hr", { style: { ...s.sep, margin: '14px 0' } }), _jsx("label", { style: s.label, children: "Token de acceso" }), _jsx("input", { type: "password", value: accessToken, onInput: (e) => setAccessToken(e.target.value), placeholder: "Opcional", style: { ...s.input, marginBottom: '6px' } }), _jsx("p", { style: s.hint, children: "Solo se necesita si configuras OPENAI_PROXY_TOKEN en Vercel." }), _jsx("button", { onClick: handleSave, style: {
                    width: '100%', padding: '10px', marginTop: '16px',
                    background: 'var(--clr-accent)', color: '#fff', border: 'none',
                    borderRadius: 'var(--r-sm)', fontSize: 'var(--text-md)',
                    fontWeight: 'var(--fw-500)', cursor: 'pointer',
                }, children: saved ? 'Guardado' : 'Guardar' }), _jsx("hr", { style: s.sep }), _jsx("span", { style: s.sectionLabel, children: "Uso este mes" }), _jsxs("div", { style: s.statRow, children: [_jsxs("div", { children: ["Traducciones: ", _jsx("strong", { style: { color: 'var(--clr-text-1)' }, children: usage.requestCount })] }), _jsxs("div", { children: ["Tokens input: ", _jsx("strong", { style: { color: 'var(--clr-text-1)' }, children: usage.inputTokens.toLocaleString() })] }), _jsxs("div", { children: ["Tokens output: ", _jsx("strong", { style: { color: 'var(--clr-text-1)' }, children: usage.outputTokens.toLocaleString() })] }), _jsxs("div", { children: ["Costo est.: ", _jsx("strong", { style: { color: 'var(--clr-text-1)' }, children: cost === null ? 'Router' : `$${cost.toFixed(4)}` }), ' ', _jsx("span", { style: { fontSize: 'var(--text-xs)', color: 'var(--clr-text-3)' }, children: "(aprox.)" })] })] })] }));
}
