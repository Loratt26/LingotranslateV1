import test from 'node:test';
import assert from 'node:assert/strict';

import {
  finalizeTranslationTrace,
  getTranslationMetricsSummary,
  getTranslationTraceSnapshot,
  markFirstTranslationUpdate,
  resetTranslationMetrics,
  startTranslationTrace,
} from '../src/lib/translation-telemetry.js';

test('translation telemetry computes averages from completed traces', async () => {
  resetTranslationMetrics();

  const trace = startTranslationTrace({
    requestId: 1,
    sourceChars: 120,
    sourceLang: 'es',
    targetLang: 'en',
    formality: 'neutral',
    unitsTotal: 3,
    unitsTranslated: 0,
    cacheHits: 0,
    inputTokens: 0,
    outputTokens: 0,
  });
  markFirstTranslationUpdate(trace);
  await new Promise((resolve) => setTimeout(resolve, 2));
  finalizeTranslationTrace(trace, {
    unitsTranslated: 3,
    cacheHits: 1,
    inputTokens: 100,
    outputTokens: 40,
  });

  const summary = getTranslationMetricsSummary();
  assert.equal(summary.count, 1);
  assert.equal(summary.totalFinished, 1);
  assert.ok(summary.avgDurationMs >= 0);
  assert.ok(summary.avgTTFUMs >= 0);
  assert.equal(summary.avgTokensPerRequest, 140);
  assert.ok(summary.avgCacheHitRatio > 0 && summary.avgCacheHitRatio <= 1);
  assert.equal(summary.cancelRate, 0);
  assert.ok(summary.requestsPerMinute > 0);
});

test('cancelled traces are excluded from summary aggregates', async () => {
  resetTranslationMetrics();

  const completed = startTranslationTrace({
    requestId: 2,
    sourceChars: 30,
    sourceLang: 'en',
    targetLang: 'es',
    formality: 'neutral',
    unitsTotal: 1,
    unitsTranslated: 0,
    cacheHits: 0,
    inputTokens: 0,
    outputTokens: 0,
  });
  markFirstTranslationUpdate(completed);
  await new Promise((resolve) => setTimeout(resolve, 1));
  finalizeTranslationTrace(completed, {
    unitsTranslated: 1,
    cacheHits: 0,
    inputTokens: 20,
    outputTokens: 15,
  });

  const cancelled = startTranslationTrace({
    requestId: 3,
    sourceChars: 40,
    sourceLang: 'en',
    targetLang: 'fr',
    formality: 'neutral',
    unitsTotal: 2,
    unitsTranslated: 0,
    cacheHits: 0,
    inputTokens: 0,
    outputTokens: 0,
  });
  finalizeTranslationTrace(cancelled, {
    cancelled: true,
    unitsTranslated: 0,
    cacheHits: 0,
  });

  const summary = getTranslationMetricsSummary();
  assert.equal(summary.count, 1);
  assert.equal(summary.totalFinished, 2);
  assert.equal(summary.avgTokensPerRequest, 35);
  assert.ok(summary.cancelRate > 0);

  const snapshot = getTranslationTraceSnapshot();
  assert.equal(snapshot.length, 2);
});
