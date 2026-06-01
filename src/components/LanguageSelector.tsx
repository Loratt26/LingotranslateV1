import { SUPPORTED_LANGUAGES } from '../lib/constants';
import type { LangCodeOrAuto } from '../lib/constants';

interface Props {
  value: LangCodeOrAuto;
  onChange: (lang: LangCodeOrAuto) => void;
  includeAuto?: boolean;
}

export function LanguageSelector({ value, onChange, includeAuto = false }: Props) {
  const options = includeAuto
    ? SUPPORTED_LANGUAGES
    : SUPPORTED_LANGUAGES.filter((l) => l.code !== 'auto');

  return (
    <select
      value={value}
      onChange={(e) => onChange((e.target as HTMLSelectElement).value as LangCodeOrAuto)}
      style={{
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
      }}
    >
      {options.map((lang) => (
        <option key={lang.code} value={lang.code}>{lang.name}</option>
      ))}
    </select>
  );
}
