import test from 'node:test';
import assert from 'node:assert/strict';

import { cacheClear, cacheSet, cacheSize } from '../src/lib/cache.js';
import {
  finalizeTranslationTrace,
  getTranslationMetricsSummary,
  getTranslationTraceSnapshot,
  resetTranslationMetrics,
  startTranslationTrace,
} from '../src/lib/translation-telemetry.js';

test('translation cache remains bounded after long sessions', () => {
  cacheClear();
  for (let index = 0; index < 5000; index += 1) {
    cacheSet(`texto-${index}`, 'es', 'en', 'neutral::segment', `translation-${index}`, []);
  }

  assert.ok(cacheSize() <= 300, `cache grew unexpectedly: ${cacheSize()}`);
  cacheClear();
});

test('telemetry trace registry stays bounded and exposes cancellation metrics', () => {
  resetTranslationMetrics();

  for (let index = 0; index < 420; index += 1) {
    const trace = startTranslationTrace({
      requestId: index + 1,
      sourceChars: 300,
      sourceLang: 'es',
      targetLang: 'en',
      formality: 'neutral',
      unitsTotal: 6,
      unitsTranslated: 0,
      cacheHits: 0,
      inputTokens: 0,
      outputTokens: 0,
    });
    finalizeTranslationTrace(trace, {
      unitsTranslated: 6,
      cacheHits: index % 2,
      inputTokens: 20,
      outputTokens: 10,
      cancelled: index % 3 === 0,
      error: index % 11 === 0 ? 'timeout' : undefined,
    });
  }

  const traces = getTranslationTraceSnapshot();
  const summary = getTranslationMetricsSummary();

  assert.ok(traces.length <= 200, `trace registry overflowed: ${traces.length}`);
  assert.ok(summary.totalFinished <= 200, `summary total overflowed: ${summary.totalFinished}`);
  assert.ok(summary.cancelRate >= 0 && summary.cancelRate <= 1, 'cancelRate should be normalized');
  assert.ok(summary.errorRate >= 0 && summary.errorRate <= 1, 'errorRate should be normalized');
  assert.ok(summary.requestsPerMinute > 0, 'requestsPerMinute should be positive');
  resetTranslationMetrics();
});
