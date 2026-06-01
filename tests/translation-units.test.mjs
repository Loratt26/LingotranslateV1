import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildUnits,
  composeTextFromUnits,
  countTranslatedUnits,
  countTranslatableUnits,
  distributeTranslationAcrossSourceSegments,
  hashText,
  hydrateTranslatedUnits,
  isTranslatableSegment,
  normalizeTranslatedSegments,
  splitIntoTranslationSegments,
  updateUnit,
} from '../src/lib/translation-units.js';

test('splitIntoTranslationSegments preserves line break boundaries', () => {
  const source = 'Hola mundo\n\nSegundo parrafo\nLinea dos';
  const segments = splitIntoTranslationSegments(source);
  assert.deepEqual(segments, ['Hola mundo', '\n\n', 'Segundo parrafo', '\n', 'Linea dos']);
});

test('buildUnits reuses matching units and increments version', () => {
  const segments = ['Hola', '\n', 'Mundo'];
  const initial = buildUnits(segments, {
    sourceLang: 'es',
    targetLang: 'en',
    confidence: 0.9,
    now: 1000,
  });
  const translated = updateUnit(
    updateUnit(initial, 0, { translation: 'Hello', status: 'translated' }, 1010),
    2,
    { translation: 'World', status: 'translated' },
    1020,
  );

  const rebuilt = buildUnits(segments, {
    sourceLang: 'es',
    targetLang: 'en',
    confidence: 0.9,
    now: 2000,
  }, translated);

  assert.equal(rebuilt[0].translation, 'Hello');
  assert.equal(rebuilt[2].translation, 'World');
  assert.equal(rebuilt[0].version, translated[0].version + 1);
  assert.equal(rebuilt[0].createdAt, translated[0].createdAt);
});

test('updateUnit marks errors and clears them once unit is translated again', () => {
  const units = buildUnits(['Hola'], {
    sourceLang: 'es',
    targetLang: 'en',
    confidence: 1,
    now: 1,
  });

  const errored = updateUnit(units, 0, { status: 'error', lastError: 'network' }, 2);
  assert.equal(errored[0].status, 'error');
  assert.equal(errored[0].lastError, 'network');

  const recovered = updateUnit(errored, 0, { status: 'translated', translation: 'Hello' }, 3);
  assert.equal(recovered[0].status, 'translated');
  assert.equal(recovered[0].translation, 'Hello');
  assert.equal(recovered[0].lastError, undefined);
});

test('composeTextFromUnits rebuilds text and counters stay coherent', () => {
  const units = buildUnits(['Hola', '\n', 'Mundo'], {
    sourceLang: 'es',
    targetLang: 'en',
    confidence: 0.8,
    now: 1,
  });
  const next = updateUnit(updateUnit(units, 0, { translation: 'Hello', status: 'translated' }, 2), 2, {
    translation: 'World',
    status: 'translated',
  }, 3);

  assert.equal(composeTextFromUnits(next), 'Hello\nWorld');
  assert.equal(countTranslatableUnits(next), 2);
  assert.ok(countTranslatedUnits(next) >= 2);
});

test('hydrateTranslatedUnits preserves full translation when segment boundaries diverge', () => {
  const source = 'Hola mundo\nSegundo parrafo';
  const translated = 'Hello\nbeautiful world\nSecond paragraph';
  const sourceSegments = splitIntoTranslationSegments(source);
  const units = buildUnits(sourceSegments, {
    sourceLang: 'es',
    targetLang: 'en',
    confidence: 0.8,
    now: 10,
  });

  const hydrated = hydrateTranslatedUnits(units, translated, 20);
  assert.equal(composeTextFromUnits(hydrated), translated);
  assert.ok(hydrated.every((unit) => unit.status === 'translated'));
});

test('distributeTranslationAcrossSourceSegments never drops trailing data', () => {
  const sourceSegments = ['', '\n\n', ''];
  const translated = 'Only translated text';
  const distributed = distributeTranslationAcrossSourceSegments(sourceSegments, translated);
  assert.equal(distributed.join(''), translated);
});

test('normalizeTranslatedSegments preserves multi-paragraph output when units complete out of order', () => {
  const source = 'Primer parrafo largo\n\nSegundo parrafo largo';
  const sourceSegments = splitIntoTranslationSegments(source);
  const partialUnitTranslations = [
    'First long paragraph',
    '\n\n',
    'Second long paragraph',
  ];

  const normalized = normalizeTranslatedSegments(sourceSegments, partialUnitTranslations);
  assert.equal(normalized.join(''), 'First long paragraph\n\nSecond long paragraph');
  assert.deepEqual(normalized, partialUnitTranslations);
});

test('stress: building 1200 segments remains deterministic and fast enough', () => {
  const segment = 'Parrafo de prueba con contenido';
  const source = Array.from({ length: 600 }, () => `${segment}\n`).join('');
  const segments = splitIntoTranslationSegments(source);
  const startedAt = performance.now();
  const units = buildUnits(segments, {
    sourceLang: 'es',
    targetLang: 'en',
    confidence: 0.6,
  });
  const elapsedMs = performance.now() - startedAt;

  assert.equal(units.length, segments.length);
  assert.ok(elapsedMs < 80, `buildUnits tardó ${elapsedMs.toFixed(2)}ms (>80ms)`);
  assert.equal(hashText(segment), hashText(segment));
  assert.equal(isTranslatableSegment('\n\n'), false);
});
