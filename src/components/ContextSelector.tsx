import { CONTEXT_OPTIONS } from '../lib/context';
import type { ContextMode } from '../lib/context';

interface Props {
  value: ContextMode;
  onChange: (mode: ContextMode) => void;
}

export function ContextSelector({ value, onChange }: Props) {
  return (
    <select
      value={value}
      onChange={(e) => onChange((e.target as HTMLSelectElement).value as ContextMode)}
      title="Modo de contexto"
      style={{
        padding: '4px 26px 4px 8px',
        border: '1px solid var(--clr-divider)',
        borderRadius: 'var(--r-full)',
        fontSize: 'var(--text-xs)',
        fontWeight: 'var(--fw-500)',
        fontFamily: 'var(--font)',
        background: 'var(--clr-bg)',
        color: 'var(--clr-text-2)',
        cursor: 'pointer',
        outline: 'none',
        appearance: 'none',
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%239ca3af'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 8px center',
        transition: 'border-color var(--ease-fast), color var(--ease-fast)',
        flexShrink: 0,
      }}
    >
      {CONTEXT_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}
