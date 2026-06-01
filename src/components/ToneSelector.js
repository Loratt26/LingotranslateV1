import { jsx as _jsx, jsxs as _jsxs } from "preact/jsx-runtime";
import { TONE_OPTIONS } from '../lib/tone';
import styles from '../app.module.css';
export function ToneSelector({ value, onChange }) {
    const active = TONE_OPTIONS.find((t) => t.value === value);
    return (_jsxs("div", { class: styles.toneSelectorWrap, title: active.hint, children: [_jsx("span", { class: styles.toneEmoji, children: active.emoji }), _jsx("select", { class: styles.toneSelect, value: value, onChange: (e) => onChange(e.target.value), "aria-label": "Translation tone", children: TONE_OPTIONS.map((opt) => (_jsxs("option", { value: opt.value, children: [opt.emoji, " ", opt.label] }, opt.value))) })] }));
}
