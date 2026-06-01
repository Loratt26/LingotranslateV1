import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('translation code no longer forces written numbers into digits', () => {
  const translate = read('src/lib/translate.ts');

  assert.doesNotMatch(translate, /WORD_TO_DIGIT/);
  assert.doesNotMatch(translate, /applyNumericSafeguard/);
  assert.doesNotMatch(translate, /N[ÚUÃ]/);
  assert.doesNotMatch(translate, /numericPreserve/);
});

test('translator UI no longer exposes numeric conversion controls', () => {
  const app = read('src/app.tsx');
  const css = read('src/app.module.css');
  const tone = read('src/lib/tone.ts');

  assert.doesNotMatch(app, /numericPreserve|handleNumericToggle|numericToggle|loadNumericPreserve|saveNumericPreserve/);
  assert.doesNotMatch(css, /numericToggle/);
  assert.doesNotMatch(tone, /numericPreserve|NUMERIC_PRESERVE_KEY|loadNumericPreserve|saveNumericPreserve|buildWritingRules/);
});
