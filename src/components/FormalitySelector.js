import { jsx as _jsx, jsxs as _jsxs } from "preact/jsx-runtime";
import { FORMALITY_OPTIONS } from '../lib/tone';
import styles from '../app.module.css';
export function FormalitySelector({ value, onChange }) {
    const active = FORMALITY_OPTIONS.find((o) => o.value === value);
    return (_jsxs("div", { class: styles.formalityWrap, title: active.hint, children: [_jsx("span", { class: styles.formalityEmoji, "aria-hidden": "true", children: active.emoji }), _jsx("select", { class: styles.formalitySelect, value: value, onChange: (e) => onChange(e.target.value), "aria-label": "Formality mode", id: "formality-selector", children: FORMALITY_OPTIONS.map((opt) => (_jsx("option", { value: opt.value, children: opt.label }, opt.value))) })] }));
}
