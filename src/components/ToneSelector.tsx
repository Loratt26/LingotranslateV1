import { TONE_OPTIONS } from '../lib/tone';
import type { ToneMode } from '../lib/tone';
import styles from '../app.module.css';

interface Props {
  value: ToneMode;
  onChange: (tone: ToneMode) => void;
}



export function ToneSelector({ value, onChange }: Props) {
  const active = TONE_OPTIONS.find((t) => t.value === value)!;

  return (
    <div class={styles.toneSelectorWrap} title={active.hint}>
      <span class={styles.toneEmoji}>{active.emoji}</span>
      <select
        class={styles.toneSelect}
        value={value}
        onChange={(e) => onChange((e.target as HTMLSelectElement).value as ToneMode)}
        aria-label="Translation tone"
      >
        {TONE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.emoji} {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
