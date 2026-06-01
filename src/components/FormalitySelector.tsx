import { FORMALITY_OPTIONS } from '../lib/tone';
import type { FormalityMode } from '../lib/tone';
import styles from '../app.module.css';

interface Props {
  value: FormalityMode;
  onChange: (mode: FormalityMode) => void;
}

export function FormalitySelector({ value, onChange }: Props) {
  const active = FORMALITY_OPTIONS.find((o) => o.value === value)!;

  return (
    <div class={styles.formalityWrap} title={active.hint}>
      <span class={styles.formalityEmoji} aria-hidden="true">{active.emoji}</span>
      <select
        class={styles.formalitySelect}
        value={value}
        onChange={(e) => onChange((e.target as HTMLSelectElement).value as FormalityMode)}
        aria-label="Formality mode"
        id="formality-selector"
      >
        {FORMALITY_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
