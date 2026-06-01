import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('word alternatives flow guards against stale async responses', () => {
  const app = read('src/app.tsx');

  assert.match(app, /wordAlternativesRequestId/);
  assert.match(app, /wordAlternativesAbort/);
  assert.match(app, /const requestId = \+\+wordAlternativesRequestId/);
  assert.match(app, /if \(requestId !== wordAlternativesRequestId\) return/);
  assert.match(app, /signal: wordAlternativesAbort\.signal/);
});

test('new translation cycles cancel in-flight alternatives and word-suggestion requests', () => {
  const app = read('src/app.tsx');

  assert.match(app, /cancelAlternativesFetch\(\);/);
  assert.match(app, /cancelWordAlternativesFetch\(\);/);
  assert.match(app, /currentAbort\?\.abort\(\);/);
  assert.match(app, /rewriteAbort\?\.abort\(\);/);
  assert.match(app, /detectionAbort\?\.abort\(\);/);
});

test('fixed source language auto-swaps with target when detection matches the target language', () => {
  const app = read('src/app.tsx');

  assert.match(app, /shouldAutoSwapLanguagePair/);
  assert.match(app, /detectedCode !== targetLang\.value/);
  assert.match(app, /autoSwapLanguagePair/);
  assert.match(app, /storage\.setSourceLang\(detectedCode\)/);
  assert.match(app, /storage\.setTargetLang\(previousSource as LangCode\)/);
  assert.match(app, /void triggerTranslation\(text\)/);
});
