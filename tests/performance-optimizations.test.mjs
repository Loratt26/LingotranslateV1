import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('vite bundles TypeScript sources before stale JavaScript copies', () => {
  const vite = read('vite.config.ts');

  assert.match(vite, /extensions:\s*\[/);
  assert.ok(vite.indexOf("'.ts'") > -1, 'vite config should list .ts');
  assert.ok(vite.indexOf("'.tsx'") > -1, 'vite config should list .tsx');
  assert.ok(vite.indexOf("'.js'") > -1, 'vite config should list .js');
  assert.ok(vite.indexOf("'.ts'") < vite.indexOf("'.js'"), '.ts should resolve before .js');
  assert.ok(vite.indexOf("'.tsx'") < vite.indexOf("'.js'"), '.tsx should resolve before .js');
});

test('live translation path detects fixed-source language changes without blocking on AI', () => {
  const app = read('src/app.tsx');

  assert.match(app, /detectLanguageFast/);
  assert.match(app, /const fastDetection\s*=\s*detectLanguageFast\(text\)/);
  assert.match(app, /fastDetection\.confidence\s*===\s*'low'\s*&&\s*text\.trim\(\)\.length\s*>=\s*24/);
  assert.match(app, /void detectLanguageAI\(text,\s*storage\.getApiKey\(\),\s*detectionAbort\.signal\)/);
  assert.doesNotMatch(app, /await detectLanguageAI/);
});

test('translation pipeline uses incremental segment reconciliation and request guards', () => {
  const app = read('src/app.tsx');

  assert.match(app, /splitIntoTranslationSegments/);
  assert.match(app, /buildReusableUnitTranslations/);
  assert.match(app, /runSegmentTasks\(pendingIndices,\s*1/);
  assert.match(app, /segmentVariant = `\$\{cacheVariant\}::segment`/);
  assert.match(app, /if\s*\(\s*requestId\s*!==\s*translationRequestId\s*\)\s*return/);
  assert.match(app, /STREAM_RENDER_THROTTLE_MS/);
  assert.match(app, /scheduleComposedTranslationUpdate/);
  assert.match(app, /composeStableTranslatedText/);
});

test('language detection has a confident local fast path before network calls', () => {
  const detectLang = read('src/lib/detect-lang.ts');

  assert.match(detectLang, /export function detectLanguageFast/);
  assert.match(detectLang, /const fastDetection\s*=\s*detectLanguageFast\(text\)/);
  assert.match(detectLang, /if\s*\(\s*fastDetection\.confidence\s*===\s*'high'\s*\)\s*return fastDetection\.code/);
});

test('translation uses a compact prompt and dynamic output token budget', () => {
  const translate = read('src/lib/translate.ts');

  assert.match(translate, /export function estimateTranslationMaxOutputTokens/);
  assert.match(translate, /maxOutputTokens:\s*estimateTranslationMaxOutputTokens\(text\)/);
  assert.doesNotMatch(translate, /TRANSLATION PRINCIPLES/);
  assert.doesNotMatch(translate, /pidele disculpas|dar cr[ée]ditos/i);
});

test('non-critical alternative generation is delayed and cancellable', () => {
  const app = read('src/app.tsx');

  assert.match(app, /ALTERNATIVES_IDLE_DELAY_MS/);
  assert.match(app, /scheduleAlternativesFetch/);
  assert.match(app, /clearTimeout\(alternativesTimer/);
});
