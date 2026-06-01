import { signal, computed } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import { translate, rewrite, translateWordAlternatives, fetchTranslationAlternatives } from './lib/translate';
import { detectLanguageAI, detectLanguageFast, getLanguageDisplayName } from './lib/detect-lang';
import { debounce } from './lib/debounce';
import { storage } from './lib/storage';
import { recordUsage } from './lib/usage-tracker';
import { loadGlossary, findMatches, incrementUsage } from './lib/glossary';
import { cacheGet, cacheSet } from './lib/cache';
import { addToHistory } from './lib/history';
import { registerShortcuts } from './lib/shortcuts';
import { ALTERNATIVES_IDLE_DELAY_MS, DEBOUNCE_MS, MIN_CHARS_TO_TRANSLATE, STREAM_RENDER_THROTTLE_MS, SUPPORTED_LANGUAGES } from './lib/constants';
import type { LangCode, LangCodeOrAuto } from './lib/constants';
import type { RewriteStyle } from './lib/context';
import { REWRITE_LABELS } from './lib/context';
import type { FormalityMode } from './lib/tone';
import { loadFormality, saveFormality } from './lib/tone';
import { addFavorite, loadFavorites } from './lib/favorites';
import type { FavoriteEntry } from './lib/favorites';
import {
  buildUnits,
  countTranslatedUnits,
  composeTextFromUnits,
  countTranslatableUnits,
  hydrateTranslatedUnits,
  isTranslatableSegment,
  normalizeTranslatedSegments,
  splitIntoTranslationSegments,
  updateUnit,
  type TranslationUnit,
} from './lib/translation-units';
import {
  finalizeTranslationTrace,
  getTranslationMetricsSummary,
  markFirstTranslationUpdate,
  startTranslationTrace,
  type TranslationTrace,
} from './lib/translation-telemetry';
import { LanguageSelector } from './components/LanguageSelector';
import { FormalitySelector } from './components/FormalitySelector';
import { SettingsPanel } from './components/SettingsPanel';
import { GlossaryPanel } from './components/GlossaryPanel';
import { HistoryPanel } from './components/HistoryPanel';
import { FavoritesPanel } from './components/FavoritesPanel';
import type { HistoryEntry } from './lib/history';
import styles from './app.module.css';

// â”€â”€ Dark mode â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function initTheme(): boolean {
  const stored = localStorage.getItem('lingo_theme');
  return stored ? stored === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
}
const darkMode = signal(initTheme());
function applyTheme(dark: boolean) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  localStorage.setItem('lingo_theme', dark ? 'dark' : 'light');
}
applyTheme(darkMode.value);

// â”€â”€ Signals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const sourceText      = signal('');
const translatedText  = signal('');
const alternatives    = signal<string[]>([]);
const isLoading       = signal(false);
const isRewriting     = signal(false);
const activeRewrite   = signal<RewriteStyle | null>(null);
const errorMsg        = signal('');
const sourceLang      = signal<LangCodeOrAuto>(storage.getSourceLang());
const targetLang      = signal<LangCode>(storage.getTargetLang());
const formalityMode   = signal<FormalityMode>(loadFormality());
const detectedLang    = signal<LangCode | null>(null);
const settingsOpen    = signal(false);
const glossaryOpen    = signal(false);
const historyOpen     = signal(false);
const favoritesOpen   = signal(false);
const copied          = signal(false);
const favSaved        = signal(false);
const toastMsg        = signal('');  // toast for replacement feedback
const isManuallyEdited = signal(false);  // BUG 1: track manual edits to output
const translationUnits = signal<TranslationUnit[]>([]);
const translationHealth = signal({
  avgTTFUMs: 0,
  avgDurationMs: 0,
  avgCacheHitRatio: 0,
  avgTokensPerRequest: 0,
  requestsPerMinute: 0,
  cancelRate: 0,
  count: 0,
});

interface WordPopoverData { word: string; alts: string[]; loading: boolean; x: number; y: number; isPhrase: boolean; }
const wordPopover = signal<WordPopoverData | null>(null);
const sourceLanguageConflict = signal<LangCode | null>(null);

const effectiveSource = computed<LangCode>(() =>
  sourceLang.value === 'auto' ? (detectedLang.value ?? 'es') : (sourceLang.value as LangCode)
);

function pickAutoTargetLang(detected: LangCode, previousDetected: LangCode | null, currentTarget: LangCode): LangCode {
  if (currentTarget !== detected) return currentTarget;
  if (previousDetected && previousDetected !== detected) return previousDetected;
  return detected === 'en' ? 'es' : 'en';
}

function isSupportedLangCode(code: string): code is LangCode {
  return SUPPORTED_LANGUAGES.some((language) => language.code === code && language.code !== 'auto');
}

// â”€â”€ Translation logic â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let currentAbort: AbortController | null = null;
let rewriteAbort: AbortController | null = null;
let alternativesAbort: AbortController | null = null;
let detectionAbort: AbortController | null = null;
let alternativesTimer: ReturnType<typeof setTimeout> | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;
let copiedTimer: ReturnType<typeof setTimeout> | null = null;
let favSavedTimer: ReturnType<typeof setTimeout> | null = null;
let wordAlternativesAbort: AbortController | null = null;
let wordAlternativesRequestId = 0;
let translationRequestId = 0;
const segmentAborts = new Set<AbortController>();
let previousSourceUnits: string[] = [];
let previousTranslatedUnits: string[] = [];
let previousSnapshotMeta: TranslationSnapshot | null = null;
let autoCorrectingLanguagePair = false;

interface SelectedFragment {
  text: string;
  start: number;
  end: number;
}

interface TranslationSnapshot {
  sourceLang: LangCode;
  targetLang: LangCode;
  formality: FormalityMode;
  detectionConfidence: number;
}

type AlternativesOptions = Omit<Parameters<typeof fetchTranslationAlternatives>[0], 'signal'>;

function sameSnapshotContext(snapshot: TranslationSnapshot): boolean {
  return (
    previousSnapshotMeta?.sourceLang === snapshot.sourceLang &&
    previousSnapshotMeta?.targetLang === snapshot.targetLang &&
    previousSnapshotMeta?.formality === snapshot.formality
  );
}

function buildReusableUnitTranslations(nextUnits: string[], snapshot: TranslationSnapshot): Map<number, string> {
  if (!sameSnapshotContext(snapshot)) return new Map();

  const buckets = new Map<string, string[]>();
  const pairCount = Math.min(previousSourceUnits.length, previousTranslatedUnits.length);

  for (let index = 0; index < pairCount; index += 1) {
    const sourceUnit = previousSourceUnits[index];
    if (!isTranslatableSegment(sourceUnit)) continue;
    const translatedUnit = previousTranslatedUnits[index];
    if (!translatedUnit) continue;
    const queue = buckets.get(sourceUnit) ?? [];
    queue.push(translatedUnit);
    buckets.set(sourceUnit, queue);
  }

  const reused = new Map<number, string>();
  nextUnits.forEach((unit, index) => {
    if (!isTranslatableSegment(unit)) return;
    const queue = buckets.get(unit);
    if (!queue?.length) return;
    const value = queue.shift();
    if (value !== undefined) reused.set(index, value);
  });

  return reused;
}

function captureTranslationSnapshot(
  sourceTextValue: string,
  translatedTextValue: string,
  snapshotMeta: TranslationSnapshot,
) {
  previousSourceUnits = splitIntoTranslationSegments(sourceTextValue);
  previousTranslatedUnits = splitIntoTranslationSegments(translatedTextValue);
  previousSnapshotMeta = snapshotMeta;
}

function clearTranslationSnapshot() {
  previousSourceUnits = [];
  previousTranslatedUnits = [];
  previousSnapshotMeta = null;
}

function buildFullyTranslatedUnits(
  source: string,
  translated: string,
  snapshot: TranslationSnapshot,
): TranslationUnit[] {
  const seeded = buildUnits(splitIntoTranslationSegments(source), {
    sourceLang: snapshot.sourceLang,
    targetLang: snapshot.targetLang,
    confidence: snapshot.detectionConfidence,
  }, translationUnits.value);
  return hydrateTranslatedUnits(seeded, translated);
}

function abortSegmentTranslations() {
  segmentAborts.forEach((controller) => controller.abort());
  segmentAborts.clear();
}

function cancelAlternativesFetch() {
  if (alternativesTimer) {
    clearTimeout(alternativesTimer);
    alternativesTimer = null;
  }
  alternativesAbort?.abort();
  alternativesAbort = null;
}

function clearToastTimer() {
  if (toastTimer) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }
}

function showToast(message: string, durationMs = 3000) {
  clearToastTimer();
  toastMsg.value = message;
  toastTimer = setTimeout(() => {
    toastTimer = null;
    toastMsg.value = '';
  }, durationMs);
}

function cancelWordAlternativesFetch() {
  wordAlternativesRequestId += 1;
  wordAlternativesAbort?.abort();
  wordAlternativesAbort = null;
}

function clearCopiedTimer() {
  if (copiedTimer) {
    clearTimeout(copiedTimer);
    copiedTimer = null;
  }
}

function clearFavSavedTimer() {
  if (favSavedTimer) {
    clearTimeout(favSavedTimer);
    favSavedTimer = null;
  }
}

function isStaleTranslationRequest(requestId: number): boolean {
  return requestId !== translationRequestId;
}

function shouldSuppressTranslationError(requestId: number, err: unknown): boolean {
  if (isStaleTranslationRequest(requestId)) return true;
  return (err as Error).name === 'AbortError';
}

function shouldAutoSwapLanguagePair(detectedCode: LangCode, confidence: number): boolean {
  if (autoCorrectingLanguagePair) return false;
  const currentSource = sourceLang.value === 'auto'
    ? (detectedLang.value ?? detectedCode)
    : (sourceLang.value as LangCode);
  if (detectedCode === currentSource) return false;
  if (detectedCode !== targetLang.value) return false;
  const sourceLocked = sourceLang.value !== 'auto';
  if (sourceLocked) {
    return confidence >= 0.55;
  }
  return confidence >= 0.75;
}

function autoSwapLanguagePair(detectedCode: LangCode) {
  autoCorrectingLanguagePair = true;
  const previousSource = sourceLang.value === 'auto'
    ? targetLang.value === detectedCode
      ? ((detectedLang.value && detectedLang.value !== detectedCode ? detectedLang.value : 'es') as LangCode)
      : targetLang.value
    : (sourceLang.value as LangCode);
  sourceLang.value = detectedCode;
  targetLang.value = previousSource as LangCode;
  detectedLang.value = detectedCode;
  sourceLanguageConflict.value = null;
  storage.setSourceLang(detectedCode);
  storage.setTargetLang(previousSource as LangCode);
  showToast(`Idiomas ajustados automaticamente: ${getLanguageDisplayName(detectedCode)} â†’ ${getLanguageDisplayName(previousSource)}`, 2600);
}

function composeStableTranslatedText(units: TranslationUnit[]): string {
  return units.map((unit) => {
    if (!isTranslatableSegment(unit.source)) {
      return unit.translation;
    }

    if (unit.status === 'translated') {
      return unit.translation;
    }

    if (unit.status === 'translating' && unit.translation.trim().length > 0) {
      return unit.translation;
    }

    return unit.source.replace(/[^\n]/g, ' ');
  }).join('');
}

function getSegmentConcurrency(totalPending: number): number {
  if (totalPending <= 1) return 1;
  if (totalPending <= 4) return totalPending;
  return 5;
}

function scheduleAlternativesFetch(
  requestId: number,
  options: AlternativesOptions,
  onDone: (alts: string[]) => void,
) {
  if (alternativesTimer) {
    clearTimeout(alternativesTimer);
    alternativesTimer = null;
  }

  alternativesTimer = setTimeout(() => {
    alternativesTimer = null;
    if (requestId !== translationRequestId) return;

    alternativesAbort?.abort();
    alternativesAbort = new AbortController();
    void fetchTranslationAlternatives({
      ...options,
      signal: alternativesAbort.signal,
    }).then((alts) => {
      if (requestId !== translationRequestId || !alts.length) return;
      onDone(alts);
    }).catch(() => {});
  }, ALTERNATIVES_IDLE_DELAY_MS);
}

function applyDetectedSourceLanguage(detectedCode: LangCode, requestId?: number) {
  if (requestId !== undefined && requestId !== translationRequestId) return;
  const previousDetected = detectedLang.value;
  detectedLang.value = detectedCode;

  if (sourceLang.value !== 'auto') {
    if (detectedCode !== sourceLang.value && previousDetected !== detectedCode) {
      sourceLanguageConflict.value = detectedCode;
      const srcName = getLanguageDisplayName(sourceLang.value);
      const detectedName = getLanguageDisplayName(detectedCode);
      showToast(`Texto detectado: ${detectedName}. El origen sigue fijo en ${srcName}.`, 3200);
    }
    return;
  }

  sourceLanguageConflict.value = null;
  const nextTarget = pickAutoTargetLang(detectedCode, previousDetected, targetLang.value);
  if (nextTarget !== targetLang.value) {
    targetLang.value = nextTarget;
    storage.setTargetLang(nextTarget);
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function markSelection(text: string, start: number, end: number): string {
  return `${text.slice(0, start)}<selected>${text.slice(start, end)}</selected>${text.slice(end)}`;
}

function replaceAllSelectedOccurrences(text: string, selected: string, replacement: string, isPhrase: boolean): string {
  if (!selected) return text;
  if (isPhrase || /\s/.test(selected)) {
    return text.split(selected).join(replacement);
  }

  const escaped = escapeRegExp(selected);
  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}_])(${escaped})(?=$|[^\\p{L}\\p{N}_])`, 'gu');
  return text.replace(pattern, (_match, prefix) => `${prefix}${replacement}`);
}

function getSelectedFragment(textarea: HTMLTextAreaElement): SelectedFragment | null {
  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? start;
  const text = textarea.value.slice(start, end).trim();
  if (text.length < 2) return null;
  return { text, start, end };
}

async function runSegmentTasks(indices: number[], limit: number, worker: (index: number) => Promise<void>) {
  let cursor = 0;
  const workerCount = Math.min(Math.max(limit, 1), indices.length);
  const runners = Array.from({ length: workerCount }, async () => {
    while (cursor < indices.length) {
      const next = indices[cursor];
      cursor += 1;
      await worker(next);
    }
  });
  await Promise.all(runners);
}

function resolveTranslationSnapshot(text: string, requestId: number): TranslationSnapshot {
  let confidence = 0.55;

  if (text.trim().length >= 5) {
    const fastDetection = detectLanguageFast(text);
    const fastCode = isSupportedLangCode(fastDetection.code) ? fastDetection.code : null;
    confidence = fastDetection.confidence === 'high'
      ? 0.92
      : fastDetection.confidence === 'medium'
      ? 0.75
      : 0.55;

    if (fastCode) {
      applyDetectedSourceLanguage(fastCode, requestId);
    } else if (sourceLang.value === 'auto' && !detectedLang.value) {
      detectedLang.value = 'es';
    }

    if (sourceLang.value === 'auto' && fastDetection.confidence === 'low' && text.trim().length >= 24) {
      detectionAbort?.abort();
      detectionAbort = new AbortController();
      void detectLanguageAI(text, storage.getApiKey(), detectionAbort.signal)
        .then((detected) => {
          if (requestId !== translationRequestId) return;
          if (!isSupportedLangCode(detected)) return;
          applyDetectedSourceLanguage(detected, requestId);
        })
        .catch((err) => {
          if ((err as Error).name === 'AbortError') return;
        });
    }
  } else if (sourceLang.value === 'auto' && !detectedLang.value) {
    detectedLang.value = 'es';
  }

  if (sourceLang.value !== 'auto') confidence = 1;

  return {
    sourceLang: sourceLang.value === 'auto' ? (detectedLang.value ?? 'es') : (sourceLang.value as LangCode),
    targetLang: targetLang.value,
    formality: formalityMode.value,
    detectionConfidence: confidence,
  };
}

async function triggerTranslation(text: string) {
  const requestId = ++translationRequestId;
  const baseTraceId = `tr-${requestId}-${Date.now().toString(36)}`;
  const trimmedText = text.trim();
  let trace: TranslationTrace | null = null;

  currentAbort?.abort();
  detectionAbort?.abort();
  rewriteAbort?.abort();
  cancelAlternativesFetch();
  cancelWordAlternativesFetch();
  abortSegmentTranslations();
  currentAbort = new AbortController();

  if (trimmedText.length < MIN_CHARS_TO_TRANSLATE) {
    translatedText.value = '';
    alternatives.value = [];
    translationUnits.value = [];
    errorMsg.value = '';
    isLoading.value = false;
    clearTranslationSnapshot();
    return;
  }

  isManuallyEdited.value = false;
  isRewriting.value = false;
  activeRewrite.value = null;
  errorMsg.value = '';
  wordPopover.value = null;
  alternatives.value = [];

  const snapshot = resolveTranslationSnapshot(text, requestId);
  if (shouldAutoSwapLanguagePair(snapshot.sourceLang, snapshot.detectionConfidence)) {
    autoSwapLanguagePair(snapshot.sourceLang);
    autoCorrectingLanguagePair = false;
    if (requestId === translationRequestId) {
      void triggerTranslation(text);
    }
    return;
  }
  const cacheVariant = snapshot.formality;
  const units = splitIntoTranslationSegments(text);
  const now = Date.now();
  const seededUnits = buildUnits(units, {
    sourceLang: snapshot.sourceLang,
    targetLang: snapshot.targetLang,
    confidence: snapshot.detectionConfidence,
    now,
  }, translationUnits.value);
  translationUnits.value = seededUnits;
  const translatableUnitCount = countTranslatableUnits(seededUnits);

  trace = startTranslationTrace({
    requestId,
    sourceChars: text.length,
    sourceLang: snapshot.sourceLang,
    targetLang: snapshot.targetLang,
    formality: snapshot.formality,
    unitsTotal: translatableUnitCount,
    unitsTranslated: 0,
    cacheHits: 0,
    inputTokens: 0,
    outputTokens: 0,
  });

  const fullCached = cacheGet(text, snapshot.sourceLang, snapshot.targetLang, cacheVariant);
  if (fullCached) {
    translatedText.value = fullCached.translation;
    if (trace) markFirstTranslationUpdate(trace);
    alternatives.value = fullCached.alternatives.slice(0, 2);
    isLoading.value = false;
    translationUnits.value = buildFullyTranslatedUnits(text, fullCached.translation, snapshot);
    translatedText.value = composeTextFromUnits(translationUnits.value);
    captureTranslationSnapshot(text, fullCached.translation, snapshot);
    if (trace) {
      finalizeTranslationTrace(trace, {
        unitsTranslated: translatableUnitCount,
        cacheHits: translatableUnitCount,
      });
      translationHealth.value = getTranslationMetricsSummary();
    }

    if (fullCached.alternatives.length < 2) {
      const glossaryMatches = findMatches(text, loadGlossary(), snapshot.sourceLang, snapshot.targetLang);
      scheduleAlternativesFetch(requestId, {
        traceId: `${baseTraceId}-alts`,
        text,
        sourceLang: snapshot.sourceLang,
        targetLang: snapshot.targetLang,
        apiKey: storage.getApiKey(),
        glossaryEntries: glossaryMatches,
        formality: snapshot.formality,
        translation: fullCached.translation,
        limit: 2,
      }, (alts) => {
        if (requestId !== translationRequestId) return;
        alternatives.value = alts;
        cacheSet(text, snapshot.sourceLang, snapshot.targetLang, cacheVariant, fullCached.translation, alts);
      });
    }
    return;
  }

  const reused = buildReusableUnitTranslations(units, snapshot);
  const pendingIndices: number[] = [];
  const segmentVariant = `${cacheVariant}::segment`;
  const composeLiveTranslation = () => composeStableTranslatedText(translationUnits.value);
  let composeTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleComposedTranslationUpdate = () => {
    if (composeTimer) return;
    composeTimer = setTimeout(() => {
      composeTimer = null;
      if (requestId !== translationRequestId) return;
      translatedText.value = composeLiveTranslation();
    }, STREAM_RENDER_THROTTLE_MS);
  };
  const flushComposedTranslationUpdate = () => {
    if (composeTimer) {
      clearTimeout(composeTimer);
      composeTimer = null;
    }
    if (requestId !== translationRequestId) return;
    translatedText.value = composeLiveTranslation();
  };
  const clearComposedTranslationTimer = () => {
    if (!composeTimer) return;
    clearTimeout(composeTimer);
    composeTimer = null;
  };
  let cacheHits = 0;

  units.forEach((unit, index) => {
    if (!isTranslatableSegment(unit)) {
      translationUnits.value = updateUnit(translationUnits.value, index, {
        translation: unit,
        status: 'translated',
      });
      return;
    }

    const unitCached = cacheGet(unit, snapshot.sourceLang, snapshot.targetLang, segmentVariant);
    if (unitCached) {
      cacheHits += 1;
      translationUnits.value = updateUnit(translationUnits.value, index, {
        translation: unitCached.translation,
        status: 'translated',
      });
      return;
    }

    const reusedTranslation = reused.get(index);
    if (reusedTranslation !== undefined) {
      cacheHits += 1;
      translationUnits.value = updateUnit(translationUnits.value, index, {
        translation: reusedTranslation,
        status: 'translated',
      });
      return;
    }

    translationUnits.value = updateUnit(translationUnits.value, index, {
      status: 'queued',
      translation: '',
    });
    pendingIndices.push(index);
  });

  translatedText.value = composeLiveTranslation();
  if (trace) markFirstTranslationUpdate(trace);
  isLoading.value = pendingIndices.length > 0;

  if (pendingIndices.length === 0) {
    const stable = composeLiveTranslation();
    translationUnits.value = buildFullyTranslatedUnits(text, stable, snapshot);
    translatedText.value = composeTextFromUnits(translationUnits.value);
    cacheSet(text, snapshot.sourceLang, snapshot.targetLang, cacheVariant, stable, []);
    captureTranslationSnapshot(text, stable, snapshot);
    if (trace) {
      finalizeTranslationTrace(trace, {
        unitsTranslated: translatableUnitCount,
        cacheHits,
      });
      translationHealth.value = getTranslationMetricsSummary();
    }
    return;
  }

  try {
    const allEntries = loadGlossary();
    const fullGlossaryMatches = findMatches(text, allEntries, snapshot.sourceLang, snapshot.targetLang);
    let inputTokens = 0;
    let outputTokens = 0;
    const glossaryHits = new Set<string>();

    await runSegmentTasks(pendingIndices, getSegmentConcurrency(pendingIndices.length), async (index) => {
      if (requestId !== translationRequestId) return;

      const unitText = units[index];
      const unitAbort = new AbortController();
      segmentAborts.add(unitAbort);
      translationUnits.value = updateUnit(translationUnits.value, index, {
        status: 'translating',
      });

      try {
        const unitGlossary = findMatches(unitText, allEntries, snapshot.sourceLang, snapshot.targetLang);
        const result = await translate({
          traceId: `${baseTraceId}-seg-${index}`,
          text: unitText,
          sourceLang: snapshot.sourceLang,
          targetLang: snapshot.targetLang,
          apiKey: storage.getApiKey(),
          glossaryEntries: unitGlossary,
          formality: snapshot.formality,
          signal: unitAbort.signal,
          onChunk: (partial) => {
            if (requestId !== translationRequestId) return;
            if (trace) markFirstTranslationUpdate(trace);
            translationUnits.value = updateUnit(translationUnits.value, index, {
              translation: partial,
              status: 'translating',
            });
            scheduleComposedTranslationUpdate();
          },
        });

        if (requestId !== translationRequestId) return;

        translationUnits.value = updateUnit(translationUnits.value, index, {
          translation: result.translation,
          status: 'translated',
        });
        scheduleComposedTranslationUpdate();
        cacheSet(unitText, snapshot.sourceLang, snapshot.targetLang, segmentVariant, result.translation, []);

        inputTokens += result.inputTokens;
        outputTokens += result.outputTokens;
        result.glossaryHitsApplied.forEach((id) => glossaryHits.add(id));
      } catch (err) {
        if (!shouldSuppressTranslationError(requestId, err)) {
          translationUnits.value = updateUnit(translationUnits.value, index, {
            status: 'error',
            lastError: (err as Error).message.slice(0, 140),
          });
        }
        throw err;
      } finally {
        segmentAborts.delete(unitAbort);
      }
    });

    if (requestId !== translationRequestId) return;

    flushComposedTranslationUpdate();
    const finalUnits = translationUnits.value;
    const finalSegments = normalizeTranslatedSegments(
      units,
      finalUnits.map((unit) => unit.translation),
    );
    const finalTranslation = finalSegments.join('');
    translationUnits.value = buildFullyTranslatedUnits(text, finalTranslation, snapshot);
    translatedText.value = composeTextFromUnits(translationUnits.value);
    cacheSet(text, snapshot.sourceLang, snapshot.targetLang, cacheVariant, finalTranslation, []);
    captureTranslationSnapshot(text, finalTranslation, snapshot);
    addToHistory({
      sourceText: text,
      translatedText: finalTranslation,
      sourceLang: snapshot.sourceLang,
      targetLang: snapshot.targetLang,
    });
    if (glossaryHits.size > 0) incrementUsage([...glossaryHits]);
    if (inputTokens > 0 || outputTokens > 0) recordUsage(inputTokens, outputTokens);
    if (trace) {
      finalizeTranslationTrace(trace, {
        unitsTranslated: Math.min(translatableUnitCount, countTranslatedUnits(translationUnits.value)),
        cacheHits,
        inputTokens,
        outputTokens,
      });
      translationHealth.value = getTranslationMetricsSummary();
    }

    scheduleAlternativesFetch(requestId, {
      traceId: `${baseTraceId}-alts`,
      text,
      sourceLang: snapshot.sourceLang,
      targetLang: snapshot.targetLang,
      apiKey: storage.getApiKey(),
      glossaryEntries: fullGlossaryMatches,
      formality: snapshot.formality,
      translation: finalTranslation,
      limit: 2,
    }, (alts) => {
      if (requestId !== translationRequestId) return;
      alternatives.value = alts;
      cacheSet(text, snapshot.sourceLang, snapshot.targetLang, cacheVariant, finalTranslation, alts);
    });
  } catch (err) {
    clearComposedTranslationTimer();
    if (shouldSuppressTranslationError(requestId, err)) {
      if (trace) {
        finalizeTranslationTrace(trace, {
          unitsTranslated: Math.min(translatableUnitCount, countTranslatedUnits(translationUnits.value)),
          cacheHits,
          cancelled: true,
        });
        translationHealth.value = getTranslationMetricsSummary();
      }
      return;
    }
    abortSegmentTranslations();
    if (isStaleTranslationRequest(requestId)) return;
    errorMsg.value = (err as Error).message;
    if (trace) {
      finalizeTranslationTrace(trace, {
        unitsTranslated: Math.min(translatableUnitCount, countTranslatedUnits(translationUnits.value)),
        cacheHits,
        error: (err as Error).message.slice(0, 180),
      });
      translationHealth.value = getTranslationMetricsSummary();
    }
    alternatives.value = [];
  } finally {
    autoCorrectingLanguagePair = false;
    clearComposedTranslationTimer();
    if (requestId === translationRequestId) {
      isLoading.value = false;
    }
  }
}

const debouncedTranslate = debounce(triggerTranslation, DEBOUNCE_MS);

async function triggerRewrite(style: RewriteStyle) {
  if (!translatedText.value || isLoading.value) return;
  cancelWordAlternativesFetch();
  wordPopover.value = null;
  rewriteAbort?.abort();
  rewriteAbort = new AbortController();
  isRewriting.value = true; activeRewrite.value = style;
  const snapshot = translatedText.value;

  try {
    const glossaryMatches = findMatches(sourceText.value, loadGlossary(), effectiveSource.value, targetLang.value);
    let accumulated = '';
    await rewrite({
      traceId: `rw-${Date.now().toString(36)}-${style}`,
      text: snapshot,
      targetLang: targetLang.value,
      style,
      formality: formalityMode.value,
      glossaryEntries: glossaryMatches,
      apiKey: storage.getApiKey(),
      signal: rewriteAbort.signal,
      onChunk: (partial) => { accumulated = partial; translatedText.value = partial; },
    });
    if (accumulated) {
      addToHistory({ sourceText: sourceText.value, translatedText: accumulated, sourceLang: effectiveSource.value, targetLang: targetLang.value });
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') return;
    translatedText.value = snapshot;
  } finally { isRewriting.value = false; activeRewrite.value = null; }
}

// â”€â”€ Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function App() {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const outputRef = useRef<HTMLTextAreaElement>(null);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [favName, setFavName] = useState('');

  useEffect(() => { textareaRef.current?.focus(); }, []);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea && textarea.value !== sourceText.value) {
      textarea.value = sourceText.value;
    }
  }, [sourceText.value]);

  useEffect(() => {
    const textarea = outputRef.current;
    if (textarea && textarea.value !== translatedText.value) {
      textarea.value = translatedText.value;
    }
  }, [translatedText.value]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const h  = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem('lingo_theme')) { darkMode.value = e.matches; applyTheme(e.matches); }
    };
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);

  useEffect(() => {
    return registerShortcuts({
      focus: () => textareaRef.current?.focus(),
      clear: () => { if (!settingsOpen.value && !glossaryOpen.value && !historyOpen.value && !favoritesOpen.value) handleClear(); },
      copy:  handleCopy,
      swap:  handleSwap,
    });
  }, []);

  useEffect(() => {
    return () => {
      debouncedTranslate.cancel();
      currentAbort?.abort();
      rewriteAbort?.abort();
      detectionAbort?.abort();
      cancelAlternativesFetch();
      cancelWordAlternativesFetch();
      abortSegmentTranslations();
      clearToastTimer();
      clearCopiedTimer();
      clearFavSavedTimer();
    };
  }, []);

  const toggleTheme  = () => { const n = !darkMode.value; darkMode.value = n; applyTheme(n); };
  const closeAllPanels = () => {
    settingsOpen.value = false; glossaryOpen.value = false;
    historyOpen.value = false; favoritesOpen.value = false;
  };

  const handleInput = (e: Event) => {
    const v = (e.target as HTMLTextAreaElement).value;
    sourceText.value = v;
    isManuallyEdited.value = false; // BUG 1: source changed, reset manual edit flag
    cancelWordAlternativesFetch();
    wordPopover.value = null;
    debouncedTranslate(v);
  };

  // BUG 1: Handle manual edits to the translation output
  const handleOutputEdit = (e: Event) => {
    const v = (e.target as HTMLTextAreaElement).value;
    cancelWordAlternativesFetch();
    wordPopover.value = null;
    translatedText.value = v;
    isManuallyEdited.value = true;
  };

  const handleFormalityChange = (mode: FormalityMode) => {
    formalityMode.value = mode; saveFormality(mode);
    cancelWordAlternativesFetch();
    wordPopover.value = null;
    if (sourceText.value.trim().length >= MIN_CHARS_TO_TRANSLATE) triggerTranslation(sourceText.value);
  };

  const handleSwap = () => {
    const ns = targetLang.value, nt = effectiveSource.value, txt = translatedText.value;
    cancelWordAlternativesFetch();
    sourceLang.value = ns; targetLang.value = nt; sourceText.value = txt;
    translatedText.value = ''; alternatives.value = []; wordPopover.value = null;
    translationUnits.value = [];
    clearTranslationSnapshot();
    storage.setSourceLang(ns); storage.setTargetLang(nt);
    if (txt.trim().length >= MIN_CHARS_TO_TRANSLATE) triggerTranslation(txt);
  };

  const handleSourceLang = (lang: LangCodeOrAuto) => {
    sourceLang.value = lang; storage.setSourceLang(lang);
    if (lang === 'auto' || lang === detectedLang.value) {
      sourceLanguageConflict.value = null;
    }
    cancelWordAlternativesFetch();
    wordPopover.value = null;
    if (sourceText.value.trim().length >= MIN_CHARS_TO_TRANSLATE) triggerTranslation(sourceText.value);
  };

  const handleTargetLang = (lang: LangCodeOrAuto) => {
    targetLang.value = lang as LangCode; storage.setTargetLang(lang as LangCode);
    cancelWordAlternativesFetch();
    wordPopover.value = null;
    if (sourceText.value.trim().length >= MIN_CHARS_TO_TRANSLATE) triggerTranslation(sourceText.value);
  };

  const handleCopy = async () => {
    if (!translatedText.value) return;
    await navigator.clipboard.writeText(translatedText.value);
    clearCopiedTimer();
    copied.value = true;
    copiedTimer = setTimeout(() => {
      copiedTimer = null;
      copied.value = false;
    }, 2000);
  };

  const handleClear = () => {
    sourceText.value = ''; translatedText.value = ''; alternatives.value = [];
    translationUnits.value = [];
    errorMsg.value = ''; detectedLang.value = null; sourceLanguageConflict.value = null; wordPopover.value = null;
    debouncedTranslate.cancel();
    currentAbort?.abort();
    rewriteAbort?.abort();
    detectionAbort?.abort();
    cancelAlternativesFetch();
    cancelWordAlternativesFetch();
    abortSegmentTranslations();
    clearToastTimer();
    clearCopiedTimer();
    clearFavSavedTimer();
    copied.value = false;
    favSaved.value = false;
    toastMsg.value = '';
    clearTranslationSnapshot();
    textareaRef.current?.focus();
  };

  const handleRestoreHistory = (entry: HistoryEntry) => {
    cancelWordAlternativesFetch();
    sourceText.value = entry.sourceText; translatedText.value = entry.translatedText;
    sourceLang.value = entry.sourceLang as LangCodeOrAuto; targetLang.value = entry.targetLang as LangCode;
    alternatives.value = [];
    const snapshot: TranslationSnapshot = {
      sourceLang: entry.sourceLang as LangCode,
      targetLang: entry.targetLang as LangCode,
      formality: formalityMode.value,
      detectionConfidence: 1,
    };
    translationUnits.value = buildFullyTranslatedUnits(entry.sourceText, entry.translatedText, snapshot);
    captureTranslationSnapshot(entry.sourceText, entry.translatedText, snapshot);
    translatedText.value = composeTextFromUnits(translationUnits.value);
    storage.setSourceLang(entry.sourceLang as LangCodeOrAuto); storage.setTargetLang(entry.targetLang as LangCode);
    historyOpen.value = false;
  };

  const handleRestoreFavorite = (entry: FavoriteEntry) => {
    cancelWordAlternativesFetch();
    sourceText.value = entry.sourceText; translatedText.value = entry.translatedText;
    sourceLang.value = entry.sourceLang as LangCodeOrAuto; targetLang.value = entry.targetLang as LangCode;
    const restoredFormality = (entry.tone as FormalityMode) || 'neutral';
    formalityMode.value = restoredFormality;
    alternatives.value = [];
    const snapshot: TranslationSnapshot = {
      sourceLang: entry.sourceLang as LangCode,
      targetLang: entry.targetLang as LangCode,
      formality: restoredFormality,
      detectionConfidence: 1,
    };
    translationUnits.value = buildFullyTranslatedUnits(entry.sourceText, entry.translatedText, snapshot);
    captureTranslationSnapshot(entry.sourceText, entry.translatedText, snapshot);
    translatedText.value = composeTextFromUnits(translationUnits.value);
    storage.setSourceLang(entry.sourceLang as LangCodeOrAuto); storage.setTargetLang(entry.targetLang as LangCode);
    saveFormality(formalityMode.value);
    favoritesOpen.value = false;
  };

  const openSaveModal = () => {
    if (!translatedText.value) return;
    setFavName(sourceText.value.slice(0, 40).replace(/\n/g, ' ') || 'Favorito');
    setSaveModalOpen(true);
  };

  const confirmSaveFavorite = () => {
    if (!translatedText.value) return;
    addFavorite({
      name: favName.trim() || 'Sin nombre',
      sourceText: sourceText.value,
      translatedText: translatedText.value,
      sourceLang: effectiveSource.value,
      targetLang: targetLang.value,
      tone: formalityMode.value,
      context: '',
    });
    setSaveModalOpen(false); setFavName('');
    clearFavSavedTimer();
    favSaved.value = true;
    favSavedTimer = setTimeout(() => {
      favSavedTimer = null;
      favSaved.value = false;
    }, 2200);
  };

  // â”€â”€ Word/phrase suggestion system for output textarea (BUG 2 fix) â”€â”€
  const getWordAtCursor = (textarea: HTMLTextAreaElement): SelectedFragment | null => {
    const pos = textarea.selectionStart;
    const text = textarea.value;
    if (!text || pos === undefined) return null;
    // Find word boundaries around cursor
    let start = pos, end = pos;
    while (start > 0 && /\S/.test(text[start - 1])) start--;
    while (end < text.length && /\S/.test(text[end])) end++;
    const raw = text.slice(start, end);
    const leadingTrim = raw.match(/^[.,!?;:'"()\[\]{}<>Ã‚Â«Ã‚Â»]+/)?.[0].length ?? 0;
    const trailingTrim = raw.match(/[.,!?;:'"()\[\]{}<>Ã‚Â«Ã‚Â»]+$/)?.[0].length ?? 0;
    const word = raw.replace(/^[.,!?;:'"()\[\]{}<>Ã‚Â«Ã‚Â»]+|[.,!?;:'"()\[\]{}<>Ã‚Â«Ã‚Â»]+$/g, '').trim();
    if (word.length < 2) return null;
    return {
      text: word,
      start: start + leadingTrim,
      end: end - trailingTrim,
    };
  };

  const handleOutputDoubleClick = async (e: MouseEvent) => {
    e.stopPropagation();
    if (isLoading.value || isRewriting.value) return;
    const textarea = outputRef.current;
    if (!textarea) return;

    // Get word at cursor for single-word click
    const fragment = getWordAtCursor(textarea);
    if (!fragment) return;

    const x = Math.min(e.clientX, window.innerWidth - 280);
    const y = e.clientY + 14;
    wordPopover.value = { word: fragment.text, alts: [], loading: true, x, y, isPhrase: false };
    const requestId = ++wordAlternativesRequestId;
    wordAlternativesAbort?.abort();
    wordAlternativesAbort = new AbortController();

    try {
      const alts = await translateWordAlternatives({
        traceId: `word-${Date.now().toString(36)}`,
        selectedText: fragment.text,
        sourceText: sourceText.value,
        translatedText: translatedText.value,
        translatedTextWithSelection: markSelection(translatedText.value, fragment.start, fragment.end),
        sourceLang: effectiveSource.value,
        targetLang: targetLang.value,
        apiKey: storage.getApiKey(),
        signal: wordAlternativesAbort.signal,
      });
      if (requestId !== wordAlternativesRequestId) return;
      wordPopover.value = { word: fragment.text, alts, loading: false, x, y, isPhrase: false };
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      wordPopover.value = null;
    } finally {
      if (requestId === wordAlternativesRequestId) {
        wordAlternativesAbort = null;
      }
    }
  };

  const handleOutputMouseUp = async (e: MouseEvent) => {
    // Only trigger for phrase selection (2+ words selected)
    const textarea = outputRef.current;
    if (!textarea) return;
    const fragment = textarea ? getSelectedFragment(textarea) : null;
    const selection = fragment?.text ?? window.getSelection()?.toString().trim() ?? '';
    if (selection.length < 2 || !selection.includes(' ')) return;
    if (isLoading.value || isRewriting.value) return;

    const x = Math.min(e.clientX, window.innerWidth - 280);
    const y = e.clientY + 14;
    wordPopover.value = { word: selection, alts: [], loading: true, x, y, isPhrase: true };
    const requestId = ++wordAlternativesRequestId;
    wordAlternativesAbort?.abort();
    wordAlternativesAbort = new AbortController();

    try {
      const alts = await translateWordAlternatives({
        traceId: `phrase-${Date.now().toString(36)}`,
        selectedText: selection,
        sourceText: sourceText.value,
        translatedText: translatedText.value,
        translatedTextWithSelection: fragment
          ? markSelection(translatedText.value, fragment.start, fragment.end)
          : translatedText.value,
        sourceLang: effectiveSource.value,
        targetLang: targetLang.value,
        apiKey: storage.getApiKey(),
        signal: wordAlternativesAbort.signal,
      });
      if (requestId !== wordAlternativesRequestId) return;
      wordPopover.value = { word: selection, alts, loading: false, x, y, isPhrase: true };
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      wordPopover.value = null;
    } finally {
      if (requestId === wordAlternativesRequestId) {
        wordAlternativesAbort = null;
      }
    }
  };


  const handlePickWordAlt = (alt: string) => {
    if (!wordPopover.value) return;
    cancelWordAlternativesFetch();
    const originalWord = wordPopover.value.word;
    const isPhrase = wordPopover.value.isPhrase;

    // Check glossary conflict (only for non-phrase, single-word)
    if (!isPhrase) {
      const allEntries = loadGlossary();
      const conflict = allEntries.find(
        (e) => e.target.toLowerCase() === originalWord.toLowerCase() &&
               e.targetLang === targetLang.value
      );
      if (conflict) {
        const ok = confirm(
          `"${originalWord}" estÃ¡ en tu glosario como traducciÃ³n de "${conflict.source}".\nÂ¿Quieres continuar con el reemplazo por "${alt}"?`
        );
        if (!ok) { wordPopover.value = null; return; }
      }
    }

    if (isPhrase) {
      translatedText.value = replaceAllSelectedOccurrences(translatedText.value, originalWord, alt, true);
      showToast('Se reemplazÃ³ la frase seleccionada');
    } else {
      translatedText.value = replaceAllSelectedOccurrences(translatedText.value, originalWord, alt, false);
      showToast('Se reemplazÃ³ la palabra seleccionada');
    }

    alternatives.value = []; wordPopover.value = null;
  };

  const rewriteStyles: RewriteStyle[] = ['friendly', 'professional', 'simple', 'persuasive', 'shorter'];

  const renderOutput = () => {
    if (isLoading.value && !translatedText.value) return (
      <div class={styles.skeleton}>
        <div class={styles.skeletonLine} style={{ width: '85%' }} />
        <div class={styles.skeletonLine} style={{ width: '70%' }} />
        <div class={styles.skeletonLine} style={{ width: '79%' }} />
      </div>
    );
    if (errorMsg.value) return <div class={`${styles.outputArea} ${styles.error}`}>âš  {errorMsg.value}</div>;
    if (!translatedText.value) return (
      <textarea
        class={`${styles.textarea} ${styles.outputTextarea}`}
        placeholder="La traducciÃ³n aparecerÃ¡ aquÃ­â€¦"
        value=""
        readOnly
      />
    );
    return (
      <div class={styles.outputWrap}>
        {isManuallyEdited.value && (
          <span class={styles.editedBadge} title="Editado manualmente">âœï¸ Editado</span>
        )}
        <textarea
          ref={outputRef}
          class={`${styles.textarea} ${styles.outputTextarea} ${isManuallyEdited.value ? styles.outputEdited : ''}`}
          onInput={handleOutputEdit}
          onDblClick={(e) => handleOutputDoubleClick(e as unknown as MouseEvent)}
          onMouseUp={(e) => handleOutputMouseUp(e as unknown as MouseEvent)}
          placeholder="La traducciÃ³n aparecerÃ¡ aquÃ­â€¦"
        />
      </div>
    );
  };

  const favCount = loadFavorites().length;

  return (
    <div class={styles.app} onClick={() => { wordPopover.value = null; }}>

      {/* â”€â”€ Header â”€â”€ */}
      <header class={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span class={styles.logo}>Lingo</span>
          <span class={styles.logoTagline}>AI translation for teams</span>
        </div>
        <div class={styles.headerActions}>
          <button class={styles.iconBtn} onClick={toggleTheme} title="Toggle theme">{darkMode.value ? 'â˜€' : 'â˜¾'}</button>
          <button
            class={`${styles.textBtn} ${favoritesOpen.value ? styles.textBtnActive : ''}`}
            onClick={() => { const o = !favoritesOpen.value; closeAllPanels(); favoritesOpen.value = o; }}
          >
            â˜… Favoritos{favCount > 0 && <span class={styles.panelBadge}>{favCount}</span>}
          </button>
          <button class={styles.textBtn} onClick={() => { closeAllPanels(); historyOpen.value = true; }}>ðŸ• Historial</button>
          <button class={styles.textBtn} onClick={() => { const o = !glossaryOpen.value; closeAllPanels(); glossaryOpen.value = o; }}>ðŸ“– Glosario</button>
          <button class={styles.textBtn} onClick={() => { const o = !settingsOpen.value; closeAllPanels(); settingsOpen.value = o; }}>âš™ Config</button>
        </div>
      </header>

      {/* â”€â”€ Workspace â”€â”€ */}
      <div class={styles.workspace}>
        <div class={styles.translator}>

          {/* Language + Formality bar */}
          <div class={styles.langBar}>
            {/* Source side */}
                <div class={styles.langBarSide}>
                  <LanguageSelector value={sourceLang.value} onChange={handleSourceLang} includeAuto />
                  {sourceLang.value === 'auto' && detectedLang.value && (
                    <span class={styles.detectedBadge}>Detectado: {getLanguageDisplayName(detectedLang.value)}</span>
                  )}
                  {sourceLang.value !== 'auto' && sourceLanguageConflict.value && (
                    <button
                      class={styles.detectedBadge}
                      onClick={() => handleSourceLang('auto')}
                      title={`Cambiar a deteccion automatica (${getLanguageDisplayName(sourceLanguageConflict.value)})`}
                    >
                      Detectado: {getLanguageDisplayName(sourceLanguageConflict.value)} Â· usar auto
                    </button>
                  )}
                  {sourceText.value && <button class={styles.clearBtn} onClick={handleClear} title="Limpiar (Esc)">Ã—</button>}
                </div>

            <button class={styles.swapBtn} onClick={handleSwap} title="Swap (Alt+S)">â‡„</button>

            {/* Target side â€” Language + Formality (single dropdown, no context) */}
            <div class={styles.langBarSide}>
              <LanguageSelector value={targetLang.value} onChange={handleTargetLang} />
              <div class={styles.langBarDivider} />
              <FormalitySelector value={formalityMode.value} onChange={handleFormalityChange} />
            </div>
          </div>

          {/* Translation panels */}
          <div class={styles.panels}>
            {/* Source */}
            <div class={styles.panel}>
              <textarea
                ref={textareaRef} class={styles.textarea}
                onInput={handleInput} placeholder="Escribe o pega texto aquÃ­â€¦" maxLength={5000}
              />
              <div class={styles.sourceFooter}>
                <span class={styles.charCount}>{sourceText.value.length} / 5000</span>
              </div>
            </div>

            {/* Target */}
            <div class={styles.panel}>
              {renderOutput()}

              {alternatives.value.length > 0 && !isRewriting.value && (
                <div class={styles.altSection}>
                  <span class={styles.altSectionLabel}>Alternativas:</span>
                  {alternatives.value.map((alt, i) => (
                    <div key={i} class={styles.altLine} onClick={() => { translatedText.value = alt; alternatives.value = []; }}>
                      {alt}
                    </div>
                  ))}
                </div>
              )}

              {translatedText.value && !errorMsg.value && (
                <div class={styles.rewriteBar}>
                  <span class={styles.rewriteLabel}>Reescribir:</span>
                  {rewriteStyles.map((style) => (
                    <button
                      key={style}
                      class={`${styles.rewriteBtn} ${activeRewrite.value === style ? styles.rewriteBtnActive : ''}`}
                      onClick={() => triggerRewrite(style)}
                      disabled={isLoading.value || isRewriting.value}
                    >
                      {isRewriting.value && activeRewrite.value === style ? 'âŸ³ ' : ''}{REWRITE_LABELS[style]}
                    </button>
                  ))}
                </div>
              )}

              <div class={styles.targetFooter}>
                <span class={styles.charCount}>
                  {translatedText.value.length} chars
                  {translationHealth.value.count > 0 && (
                    <>
                      {' '}Â· TTFU {Math.round(translationHealth.value.avgTTFUMs)}ms
                      {' '}Â· Avg {Math.round(translationHealth.value.avgDurationMs)}ms
                      {' '}Â· Cache {Math.round(translationHealth.value.avgCacheHitRatio * 100)}%
                      {' '}Â· RPM {translationHealth.value.requestsPerMinute.toFixed(1)}
                    </>
                  )}
                </span>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    class={`${styles.favBtn} ${favSaved.value ? styles.favBtnSaved : ''}`}
                    onClick={openSaveModal}
                    disabled={!translatedText.value || isLoading.value}
                    title="Guardar en favoritos"
                  >
                    {favSaved.value ? 'â˜… Guardado' : 'â˜† Guardar'}
                  </button>
                  <button
                    class={`${styles.copyBtn} ${copied.value ? styles.copyBtnSuccess : ''}`}
                    onClick={handleCopy}
                    disabled={!translatedText.value || isLoading.value}
                    title="Copiar (Alt+C)"
                  >
                    <span>{copied.value ? 'âœ“' : 'ðŸ“‹'}</span>
                    <span>{copied.value ? 'Copiado' : 'Copiar'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div class={styles.shortcutsBar}>
            <span>Alt+T â€” Focus</span>
            <span>Alt+C â€” Copiar</span>
            <span>Alt+S â€” Swap</span>
            <span>Esc â€” Limpiar</span>
          </div>
        </div>
      </div>

      {/* Toast notification */}
      {toastMsg.value && (
        <div class={styles.toast}>{toastMsg.value}</div>
      )}

      {/* Word alternatives popover */}
      {wordPopover.value && (
        <>
          <div class={styles.wordPopoverOverlay} onClick={() => { cancelWordAlternativesFetch(); wordPopover.value = null; }} />
          <div class={styles.wordPopover}
            style={{ left: `${wordPopover.value.x}px`, top: `${wordPopover.value.y}px` }}
            onClick={(e) => e.stopPropagation()}
          >
            <div class={styles.wordPopoverTitle}>
              {wordPopover.value.isPhrase ? 'Frase' : 'Alternativas'}: Â«{wordPopover.value.word.length > 30 ? wordPopover.value.word.slice(0, 30) + 'â€¦' : wordPopover.value.word}Â»
            </div>
            <div class={styles.wordPopoverScroll}>
              {wordPopover.value.loading
                ? <div class={styles.wordPopoverLoading}>Buscando alternativasâ€¦</div>
                : wordPopover.value.alts.length === 0
                ? <div class={styles.wordPopoverLoading}>Sin alternativas</div>
                : wordPopover.value.alts.map((alt, i) => (
                  <button key={i} class={styles.wordPopoverItem} onClick={() => handlePickWordAlt(alt)}>{alt}</button>
                ))
              }
            </div>
          </div>
        </>
      )}

      {/* â”€â”€ Save Favorite Modal â”€â”€ */}
      {saveModalOpen && (
        <>
          <div class={styles.modalOverlay} onClick={() => setSaveModalOpen(false)} />
          <div class={styles.modal}>
            <div class={styles.modalHeader}>
              <span class={styles.modalTitle}>â˜… Guardar como favorito</span>
              <button onClick={() => setSaveModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: 'var(--clr-text-3)' }}>Ã—</button>
            </div>
            <label class={styles.modalLabel}>Nombre del favorito</label>
            <input
              class={styles.modalInput}
              type="text"
              value={favName}
              onInput={(e) => setFavName((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => { if ((e as KeyboardEvent).key === 'Enter') confirmSaveFavorite(); }}
              maxLength={80}
              autoFocus
              placeholder="Ej: Respuesta de bienvenida en inglÃ©s"
            />
            <div class={styles.modalPreview}>
              <div class={styles.modalPreviewRow}>
                <span class={styles.modalPreviewLang}>{effectiveSource.value.toUpperCase()} â†’ {targetLang.value.toUpperCase()}</span>
                <span class={styles.modalPreviewMeta}>{formalityMode.value}</span>
              </div>
              <div class={styles.modalPreviewText}>{sourceText.value.slice(0, 100)}{sourceText.value.length > 100 ? 'â€¦' : ''}</div>
              <div class={styles.modalPreviewTranslation}>{translatedText.value.slice(0, 100)}{translatedText.value.length > 100 ? 'â€¦' : ''}</div>
            </div>
            <div class={styles.modalActions}>
              <button class={styles.modalCancelBtn} onClick={() => setSaveModalOpen(false)}>Cancelar</button>
              <button class={styles.modalSaveBtn} onClick={confirmSaveFavorite} disabled={!favName.trim()}>
                â˜… Guardar favorito
              </button>
            </div>
          </div>
        </>
      )}

      {settingsOpen.value  && <SettingsPanel  onClose={() => { settingsOpen.value  = false; }} />}
      {glossaryOpen.value  && <GlossaryPanel  onClose={() => { glossaryOpen.value  = false; }} sourceLang={effectiveSource.value} targetLang={targetLang.value} />}
      {historyOpen.value   && <HistoryPanel   onClose={() => { historyOpen.value   = false; }} onRestore={handleRestoreHistory} />}
      {favoritesOpen.value && <FavoritesPanel onClose={() => { favoritesOpen.value = false; }} onRestore={handleRestoreFavorite} />}
    </div>
  );
}
