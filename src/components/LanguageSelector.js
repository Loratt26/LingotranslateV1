import { jsx as _jsx } from "preact/jsx-runtime";
import { SUPPORTED_LANGUAGES } from '../lib/constants';
export function LanguageSelector({ value, onChange, includeAuto = false }) {
    const options = includeAuto
        ? SUPPORTED_LANGUAGES
        : SUPPORTED_LANGUAGES.filter((l) => l.code !== 'auto');
    return (_jsx("select", { value: value, onChange: (e) => onChange(e.target.value), style: {
            padding: '5px 10px',
            border: '1px solid var(--clr-divider)',
            borderRadius: 'var(--r-sm)',
            fontSize: 'var(--text-sm)',
            fontWeight: 'var(--fw-500)',
            fontFamily: 'var(--font)',
            background: 'var(--clr-bg)',
            color: 'var(--clr-text-1)',
            cursor: 'pointer',
            outline: 'none',
            transition: 'border-color 80ms ease',
        }, children: options.map((lang) => (_jsx("option", { value: lang.code, children: lang.name }, lang.code))) }));
}
