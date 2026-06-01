import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "preact/jsx-runtime";
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
import { REWRITE_LABELS } from './lib/context';
import { loadFormality, saveFormality } from './lib/tone';
import { addFavorite, loadFavorites } from './lib/favorites';
import { buildUnits, countTranslatedUnits, composeTextFromUnits, countTranslatableUnits, hydrateTranslatedUnits, isTranslatableSegment, normalizeTranslatedSegments, splitIntoTranslationSegments, updateUnit, } from './lib/translation-units';
import { finalizeTranslationTrace, getTranslationMetricsSummary, markFirstTranslationUpdate, startTranslationTrace, } from './lib/translation-telemetry';
import { LanguageSelector } from './components/LanguageSelector';
import { FormalitySelector } from './components/FormalitySelector';
import { SettingsPanel } from './components/SettingsPanel';
import { GlossaryPanel } from './components/GlossaryPanel';
import { HistoryPanel } from './components/HistoryPanel';
import { FavoritesPanel } from './components/FavoritesPanel';
import styles from './app.module.css';
// â”€â”€ Dark mode â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function initTheme() {
    const stored = localStorage.getItem('lingo_theme');
    return stored ? stored === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
}
const darkMode = signal(initTheme());
function applyTheme(dark) {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    localStorage.setItem('lingo_theme', dark ? 'dark' : 'light');
}
applyTheme(darkMode.value);
// â”€â”€ Signals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const sourceText = signal('');
const translatedText = signal('');
const alternatives = signal([]);
const isLoading = signal(false);
const isRewriting = signal(false);
const activeRewrite = signal(null);
const errorMsg = signal('');
const sourceLang = signal(storage.getSourceLang());
const targetLang = signal(storage.getTargetLang());
const formalityMode = signal(loadFormality());
const detectedLang = signal(null);
const settingsOpen = signal(false);
const glossaryOpen = signal(false);
const historyOpen = signal(false);
const favoritesOpen = signal(false);
const copied = signal(false);
const favSaved = signal(false);
const toastMsg = signal(''); // toast for replacement feedback
const isManuallyEdited = signal(false); // BUG 1: track manual edits to output
const translationUnits = signal([]);
const translationHealth = signal({
    avgTTFUMs: 0,
    avgDurationMs: 0,
    avgCacheHitRatio: 0,
    avgTokensPerRequest: 0,
    requestsPerMinute: 0,
    cancelRate: 0,
    count: 0,
});
const wordPopover = signal(null);
const sourceLanguageConflict = signal(null);
const effectiveSource = computed(() => sourceLang.value === 'auto' ? (detectedLang.value ?? 'es') : sourceLang.value);
function pickAutoTargetLang(detected, previousDetected, currentTarget) {
    if (currentTarget !== detected)
        return currentTarget;
    if (previousDetected && previousDetected !== detected)
        return previousDetected;
    return detected === 'en' ? 'es' : 'en';
}
function isSupportedLangCode(code) {
    return SUPPORTED_LANGUAGES.some((language) => language.code === code && language.code !== 'auto');
}
// â”€â”€ Translation logic â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let currentAbort = null;
let rewriteAbort = null;
let alternativesAbort = null;
let detectionAbort = null;
let alternativesTimer = null;
let toastTimer = null;
let copiedTimer = null;
let favSavedTimer = null;
let wordAlternativesAbort = null;
let wordAlternativesRequestId = 0;
let translationRequestId = 0;
const segmentAborts = new Set();
let previousSourceUnits = [];
let previousTranslatedUnits = [];
let previousSnapshotMeta = null;
let autoCorrectingLanguagePair = false;
function sameSnapshotContext(snapshot) {
    return (previousSnapshotMeta?.sourceLang === snapshot.sourceLang &&
        previousSnapshotMeta?.targetLang === snapshot.targetLang &&
        previousSnapshotMeta?.formality === snapshot.formality);
}
function buildReusableUnitTranslations(nextUnits, snapshot) {
    if (!sameSnapshotContext(snapshot))
        return new Map();
    const buckets = new Map();
    const pairCount = Math.min(previousSourceUnits.length, previousTranslatedUnits.length);
    for (let index = 0; index < pairCount; index += 1) {
        const sourceUnit = previousSourceUnits[index];
        if (!isTranslatableSegment(sourceUnit))
            continue;
        const translatedUnit = previousTranslatedUnits[index];
        if (!translatedUnit)
            continue;
        const queue = buckets.get(sourceUnit) ?? [];
        queue.push(translatedUnit);
        buckets.set(sourceUnit, queue);
    }
    const reused = new Map();
    nextUnits.forEach((unit, index) => {
        if (!isTranslatableSegment(unit))
            return;
        const queue = buckets.get(unit);
        if (!queue?.length)
            return;
        const value = queue.shift();
        if (value !== undefined)
            reused.set(index, value);
    });
    return reused;
}
function captureTranslationSnapshot(sourceTextValue, translatedTextValue, snapshotMeta) {
    previousSourceUnits = splitIntoTranslationSegments(sourceTextValue);
    previousTranslatedUnits = splitIntoTranslationSegments(translatedTextValue);
    previousSnapshotMeta = snapshotMeta;
}
function clearTranslationSnapshot() {
    previousSourceUnits = [];
    previousTranslatedUnits = [];
    previousSnapshotMeta = null;
}
function buildFullyTranslatedUnits(source, translated, snapshot) {
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
function showToast(message, durationMs = 3000) {
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
function isStaleTranslationRequest(requestId) {
    return requestId !== translationRequestId;
}
function shouldSuppressTranslationError(requestId, err) {
    if (isStaleTranslationRequest(requestId))
        return true;
    return err.name === 'AbortError';
}
function shouldAutoSwapLanguagePair(detectedCode, confidence) {
    if (autoCorrectingLanguagePair)
        return false;
    const currentSource = sourceLang.value === 'auto'
        ? (detectedLang.value ?? detectedCode)
        : sourceLang.value;
    if (detectedCode === currentSource)
        return false;
    if (detectedCode !== targetLang.value)
        return false;
    const sourceLocked = sourceLang.value !== 'auto';
    if (sourceLocked) {
        return confidence >= 0.55;
    }
    return confidence >= 0.75;
}
function autoSwapLanguagePair(detectedCode) {
    autoCorrectingLanguagePair = true;
    const previousSource = sourceLang.value === 'auto'
        ? targetLang.value === detectedCode
            ? (detectedLang.value && detectedLang.value !== detectedCode ? detectedLang.value : 'es')
            : targetLang.value
        : sourceLang.value;
    sourceLang.value = detectedCode;
    targetLang.value = previousSource;
    detectedLang.value = detectedCode;
    sourceLanguageConflict.value = null;
    storage.setSourceLang(detectedCode);
    storage.setTargetLang(previousSource);
    showToast(`Idiomas ajustados automaticamente: ${getLanguageDisplayName(detectedCode)} â†’ ${getLanguageDisplayName(previousSource)}`, 2600);
}
function composeStableTranslatedText(units) {
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
function getSegmentConcurrency(totalPending) {
    if (totalPending <= 1)
        return 1;
    if (totalPending <= 4)
        return totalPending;
    return 5;
}
function scheduleAlternativesFetch(requestId, options, onDone) {
    if (alternativesTimer) {
        clearTimeout(alternativesTimer);
        alternativesTimer = null;
    }
    alternativesTimer = setTimeout(() => {
        alternativesTimer = null;
        if (requestId !== translationRequestId)
            return;
        alternativesAbort?.abort();
        alternativesAbort = new AbortController();
        void fetchTranslationAlternatives({
            ...options,
            signal: alternativesAbort.signal,
        }).then((alts) => {
            if (requestId !== translationRequestId || !alts.length)
                return;
            onDone(alts);
        }).catch(() => { });
    }, ALTERNATIVES_IDLE_DELAY_MS);
}
function applyDetectedSourceLanguage(detectedCode, requestId) {
    if (requestId !== undefined && requestId !== translationRequestId)
        return;
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
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function markSelection(text, start, end) {
    return `${text.slice(0, start)}<selected>${text.slice(start, end)}</selected>${text.slice(end)}`;
}
function replaceAllSelectedOccurrences(text, selected, replacement, isPhrase) {
    if (!selected)
        return text;
    if (isPhrase || /\s/.test(selected)) {
        return text.split(selected).join(replacement);
    }
    const escaped = escapeRegExp(selected);
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}_])(${escaped})(?=$|[^\\p{L}\\p{N}_])`, 'gu');
    return text.replace(pattern, (_match, prefix) => `${prefix}${replacement}`);
}
function getSelectedFragment(textarea) {
    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? start;
    const text = textarea.value.slice(start, end).trim();
    if (text.length < 2)
        return null;
    return { text, start, end };
}
async function runSegmentTasks(indices, limit, worker) {
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
function resolveTranslationSnapshot(text, requestId) {
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
        }
        else if (sourceLang.value === 'auto' && !detectedLang.value) {
            detectedLang.value = 'es';
        }
        if (sourceLang.value === 'auto' && fastDetection.confidence === 'low' && text.trim().length >= 24) {
            detectionAbort?.abort();
            detectionAbort = new AbortController();
            void detectLanguageAI(text, storage.getApiKey(), detectionAbort.signal)
                .then((detected) => {
                if (requestId !== translationRequestId)
                    return;
                if (!isSupportedLangCode(detected))
                    return;
                applyDetectedSourceLanguage(detected, requestId);
            })
                .catch((err) => {
                if (err.name === 'AbortError')
                    return;
            });
        }
    }
    else if (sourceLang.value === 'auto' && !detectedLang.value) {
        detectedLang.value = 'es';
    }
    if (sourceLang.value !== 'auto')
        confidence = 1;
    return {
        sourceLang: sourceLang.value === 'auto' ? (detectedLang.value ?? 'es') : sourceLang.value,
        targetLang: targetLang.value,
        formality: formalityMode.value,
        detectionConfidence: confidence,
    };
}
async function triggerTranslation(text) {
    const requestId = ++translationRequestId;
    const baseTraceId = `tr-${requestId}-${Date.now().toString(36)}`;
    const trimmedText = text.trim();
    let trace = null;
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
        if (trace)
            markFirstTranslationUpdate(trace);
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
                if (requestId !== translationRequestId)
                    return;
                alternatives.value = alts;
                cacheSet(text, snapshot.sourceLang, snapshot.targetLang, cacheVariant, fullCached.translation, alts);
            });
        }
        return;
    }
    const reused = buildReusableUnitTranslations(units, snapshot);
    const pendingIndices = [];
    const segmentVariant = `${cacheVariant}::segment`;
    const composeLiveTranslation = () => composeStableTranslatedText(translationUnits.value);
    let composeTimer = null;
    const scheduleComposedTranslationUpdate = () => {
        if (composeTimer)
            return;
        composeTimer = setTimeout(() => {
            composeTimer = null;
            if (requestId !== translationRequestId)
                return;
            translatedText.value = composeLiveTranslation();
        }, STREAM_RENDER_THROTTLE_MS);
    };
    const flushComposedTranslationUpdate = () => {
        if (composeTimer) {
            clearTimeout(composeTimer);
            composeTimer = null;
        }
        if (requestId !== translationRequestId)
            return;
        translatedText.value = composeLiveTranslation();
    };
    const clearComposedTranslationTimer = () => {
        if (!composeTimer)
            return;
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
    if (trace)
        markFirstTranslationUpdate(trace);
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
        const glossaryHits = new Set();
        await runSegmentTasks(pendingIndices, getSegmentConcurrency(pendingIndices.length), async (index) => {
            if (requestId !== translationRequestId)
                return;
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
                        if (requestId !== translationRequestId)
                            return;
                        if (trace)
                            markFirstTranslationUpdate(trace);
                        translationUnits.value = updateUnit(translationUnits.value, index, {
                            translation: partial,
                            status: 'translating',
                        });
                        scheduleComposedTranslationUpdate();
                    },
                });
                if (requestId !== translationRequestId)
                    return;
                translationUnits.value = updateUnit(translationUnits.value, index, {
                    translation: result.translation,
                    status: 'translated',
                });
                scheduleComposedTranslationUpdate();
                cacheSet(unitText, snapshot.sourceLang, snapshot.targetLang, segmentVariant, result.translation, []);
                inputTokens += result.inputTokens;
                outputTokens += result.outputTokens;
                result.glossaryHitsApplied.forEach((id) => glossaryHits.add(id));
            }
            catch (err) {
                if (!shouldSuppressTranslationError(requestId, err)) {
                    translationUnits.value = updateUnit(translationUnits.value, index, {
                        status: 'error',
                        lastError: err.message.slice(0, 140),
                    });
                }
                throw err;
            }
            finally {
                segmentAborts.delete(unitAbort);
            }
        });
        if (requestId !== translationRequestId)
            return;
        flushComposedTranslationUpdate();
        const finalUnits = translationUnits.value;
        const finalSegments = normalizeTranslatedSegments(units, finalUnits.map((unit) => unit.translation));
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
        if (glossaryHits.size > 0)
            incrementUsage([...glossaryHits]);
        if (inputTokens > 0 || outputTokens > 0)
            recordUsage(inputTokens, outputTokens);
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
            if (requestId !== translationRequestId)
                return;
            alternatives.value = alts;
            cacheSet(text, snapshot.sourceLang, snapshot.targetLang, cacheVariant, finalTranslation, alts);
        });
    }
    catch (err) {
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
        if (isStaleTranslationRequest(requestId))
            return;
        errorMsg.value = err.message;
        if (trace) {
            finalizeTranslationTrace(trace, {
                unitsTranslated: Math.min(translatableUnitCount, countTranslatedUnits(translationUnits.value)),
                cacheHits,
                error: err.message.slice(0, 180),
            });
            translationHealth.value = getTranslationMetricsSummary();
        }
        alternatives.value = [];
    }
    finally {
        autoCorrectingLanguagePair = false;
        clearComposedTranslationTimer();
        if (requestId === translationRequestId) {
            isLoading.value = false;
        }
    }
}
const debouncedTranslate = debounce(triggerTranslation, DEBOUNCE_MS);
async function triggerRewrite(style) {
    if (!translatedText.value || isLoading.value)
        return;
    cancelWordAlternativesFetch();
    wordPopover.value = null;
    rewriteAbort?.abort();
    rewriteAbort = new AbortController();
    isRewriting.value = true;
    activeRewrite.value = style;
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
    }
    catch (err) {
        if (err.name === 'AbortError')
            return;
        translatedText.value = snapshot;
    }
    finally {
        isRewriting.value = false;
        activeRewrite.value = null;
    }
}
// â”€â”€ Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function App() {
    const textareaRef = useRef(null);
    const outputRef = useRef(null);
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
        const h = (e) => {
            if (!localStorage.getItem('lingo_theme')) {
                darkMode.value = e.matches;
                applyTheme(e.matches);
            }
        };
        mq.addEventListener('change', h);
        return () => mq.removeEventListener('change', h);
    }, []);
    useEffect(() => {
        return registerShortcuts({
            focus: () => textareaRef.current?.focus(),
            clear: () => { if (!settingsOpen.value && !glossaryOpen.value && !historyOpen.value && !favoritesOpen.value)
                handleClear(); },
            copy: handleCopy,
            swap: handleSwap,
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
    const toggleTheme = () => { const n = !darkMode.value; darkMode.value = n; applyTheme(n); };
    const closeAllPanels = () => {
        settingsOpen.value = false;
        glossaryOpen.value = false;
        historyOpen.value = false;
        favoritesOpen.value = false;
    };
    const handleInput = (e) => {
        const v = e.target.value;
        sourceText.value = v;
        isManuallyEdited.value = false; // BUG 1: source changed, reset manual edit flag
        cancelWordAlternativesFetch();
        wordPopover.value = null;
        debouncedTranslate(v);
    };
    // BUG 1: Handle manual edits to the translation output
    const handleOutputEdit = (e) => {
        const v = e.target.value;
        cancelWordAlternativesFetch();
        wordPopover.value = null;
        translatedText.value = v;
        isManuallyEdited.value = true;
    };
    const handleFormalityChange = (mode) => {
        formalityMode.value = mode;
        saveFormality(mode);
        cancelWordAlternativesFetch();
        wordPopover.value = null;
        if (sourceText.value.trim().length >= MIN_CHARS_TO_TRANSLATE)
            triggerTranslation(sourceText.value);
    };
    const handleSwap = () => {
        const ns = targetLang.value, nt = effectiveSource.value, txt = translatedText.value;
        cancelWordAlternativesFetch();
        sourceLang.value = ns;
        targetLang.value = nt;
        sourceText.value = txt;
        translatedText.value = '';
        alternatives.value = [];
        wordPopover.value = null;
        translationUnits.value = [];
        clearTranslationSnapshot();
        storage.setSourceLang(ns);
        storage.setTargetLang(nt);
        if (txt.trim().length >= MIN_CHARS_TO_TRANSLATE)
            triggerTranslation(txt);
    };
    const handleSourceLang = (lang) => {
        sourceLang.value = lang;
        storage.setSourceLang(lang);
        if (lang === 'auto' || lang === detectedLang.value) {
            sourceLanguageConflict.value = null;
        }
        cancelWordAlternativesFetch();
        wordPopover.value = null;
        if (sourceText.value.trim().length >= MIN_CHARS_TO_TRANSLATE)
            triggerTranslation(sourceText.value);
    };
    const handleTargetLang = (lang) => {
        targetLang.value = lang;
        storage.setTargetLang(lang);
        cancelWordAlternativesFetch();
        wordPopover.value = null;
        if (sourceText.value.trim().length >= MIN_CHARS_TO_TRANSLATE)
            triggerTranslation(sourceText.value);
    };
    const handleCopy = async () => {
        if (!translatedText.value)
            return;
        await navigator.clipboard.writeText(translatedText.value);
        clearCopiedTimer();
        copied.value = true;
        copiedTimer = setTimeout(() => {
            copiedTimer = null;
            copied.value = false;
        }, 2000);
    };
    const handleClear = () => {
        sourceText.value = '';
        translatedText.value = '';
        alternatives.value = [];
        translationUnits.value = [];
        errorMsg.value = '';
        detectedLang.value = null;
        sourceLanguageConflict.value = null;
        wordPopover.value = null;
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
    const handleRestoreHistory = (entry) => {
        cancelWordAlternativesFetch();
        sourceText.value = entry.sourceText;
        translatedText.value = entry.translatedText;
        sourceLang.value = entry.sourceLang;
        targetLang.value = entry.targetLang;
        alternatives.value = [];
        const snapshot = {
            sourceLang: entry.sourceLang,
            targetLang: entry.targetLang,
            formality: formalityMode.value,
            detectionConfidence: 1,
        };
        translationUnits.value = buildFullyTranslatedUnits(entry.sourceText, entry.translatedText, snapshot);
        captureTranslationSnapshot(entry.sourceText, entry.translatedText, snapshot);
        translatedText.value = composeTextFromUnits(translationUnits.value);
        storage.setSourceLang(entry.sourceLang);
        storage.setTargetLang(entry.targetLang);
        historyOpen.value = false;
    };
    const handleRestoreFavorite = (entry) => {
        cancelWordAlternativesFetch();
        sourceText.value = entry.sourceText;
        translatedText.value = entry.translatedText;
        sourceLang.value = entry.sourceLang;
        targetLang.value = entry.targetLang;
        const restoredFormality = entry.tone || 'neutral';
        formalityMode.value = restoredFormality;
        alternatives.value = [];
        const snapshot = {
            sourceLang: entry.sourceLang,
            targetLang: entry.targetLang,
            formality: restoredFormality,
            detectionConfidence: 1,
        };
        translationUnits.value = buildFullyTranslatedUnits(entry.sourceText, entry.translatedText, snapshot);
        captureTranslationSnapshot(entry.sourceText, entry.translatedText, snapshot);
        translatedText.value = composeTextFromUnits(translationUnits.value);
        storage.setSourceLang(entry.sourceLang);
        storage.setTargetLang(entry.targetLang);
        saveFormality(formalityMode.value);
        favoritesOpen.value = false;
    };
    const openSaveModal = () => {
        if (!translatedText.value)
            return;
        setFavName(sourceText.value.slice(0, 40).replace(/\n/g, ' ') || 'Favorito');
        setSaveModalOpen(true);
    };
    const confirmSaveFavorite = () => {
        if (!translatedText.value)
            return;
        addFavorite({
            name: favName.trim() || 'Sin nombre',
            sourceText: sourceText.value,
            translatedText: translatedText.value,
            sourceLang: effectiveSource.value,
            targetLang: targetLang.value,
            tone: formalityMode.value,
            context: '',
        });
        setSaveModalOpen(false);
        setFavName('');
        clearFavSavedTimer();
        favSaved.value = true;
        favSavedTimer = setTimeout(() => {
            favSavedTimer = null;
            favSaved.value = false;
        }, 2200);
    };
    // â”€â”€ Word/phrase suggestion system for output textarea (BUG 2 fix) â”€â”€
    const getWordAtCursor = (textarea) => {
        const pos = textarea.selectionStart;
        const text = textarea.value;
        if (!text || pos === undefined)
            return null;
        // Find word boundaries around cursor
        let start = pos, end = pos;
        while (start > 0 && /\S/.test(text[start - 1]))
            start--;
        while (end < text.length && /\S/.test(text[end]))
            end++;
        const raw = text.slice(start, end);
        const leadingTrim = raw.match(/^[.,!?;:'"()\[\]{}<>Ã‚Â«Ã‚Â»]+/)?.[0].length ?? 0;
        const trailingTrim = raw.match(/[.,!?;:'"()\[\]{}<>Ã‚Â«Ã‚Â»]+$/)?.[0].length ?? 0;
        const word = raw.replace(/^[.,!?;:'"()\[\]{}<>Ã‚Â«Ã‚Â»]+|[.,!?;:'"()\[\]{}<>Ã‚Â«Ã‚Â»]+$/g, '').trim();
        if (word.length < 2)
            return null;
        return {
            text: word,
            start: start + leadingTrim,
            end: end - trailingTrim,
        };
    };
    const handleOutputDoubleClick = async (e) => {
        e.stopPropagation();
        if (isLoading.value || isRewriting.value)
            return;
        const textarea = outputRef.current;
        if (!textarea)
            return;
        // Get word at cursor for single-word click
        const fragment = getWordAtCursor(textarea);
        if (!fragment)
            return;
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
            if (requestId !== wordAlternativesRequestId)
                return;
            wordPopover.value = { word: fragment.text, alts, loading: false, x, y, isPhrase: false };
        }
        catch (err) {
            if (err.name === 'AbortError')
                return;
            wordPopover.value = null;
        }
        finally {
            if (requestId === wordAlternativesRequestId) {
                wordAlternativesAbort = null;
            }
        }
    };
    const handleOutputMouseUp = async (e) => {
        // Only trigger for phrase selection (2+ words selected)
        const textarea = outputRef.current;
        if (!textarea)
            return;
        const fragment = textarea ? getSelectedFragment(textarea) : null;
        const selection = fragment?.text ?? window.getSelection()?.toString().trim() ?? '';
        if (selection.length < 2 || !selection.includes(' '))
            return;
        if (isLoading.value || isRewriting.value)
            return;
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
            if (requestId !== wordAlternativesRequestId)
                return;
            wordPopover.value = { word: selection, alts, loading: false, x, y, isPhrase: true };
        }
        catch (err) {
            if (err.name === 'AbortError')
                return;
            wordPopover.value = null;
        }
        finally {
            if (requestId === wordAlternativesRequestId) {
                wordAlternativesAbort = null;
            }
        }
    };
    const handlePickWordAlt = (alt) => {
        if (!wordPopover.value)
            return;
        cancelWordAlternativesFetch();
        const originalWord = wordPopover.value.word;
        const isPhrase = wordPopover.value.isPhrase;
        // Check glossary conflict (only for non-phrase, single-word)
        if (!isPhrase) {
            const allEntries = loadGlossary();
            const conflict = allEntries.find((e) => e.target.toLowerCase() === originalWord.toLowerCase() &&
                e.targetLang === targetLang.value);
            if (conflict) {
                const ok = confirm(`"${originalWord}" estÃ¡ en tu glosario como traducciÃ³n de "${conflict.source}".\nÂ¿Quieres continuar con el reemplazo por "${alt}"?`);
                if (!ok) {
                    wordPopover.value = null;
                    return;
                }
            }
        }
        if (isPhrase) {
            translatedText.value = replaceAllSelectedOccurrences(translatedText.value, originalWord, alt, true);
            showToast('Se reemplazÃ³ la frase seleccionada');
        }
        else {
            translatedText.value = replaceAllSelectedOccurrences(translatedText.value, originalWord, alt, false);
            showToast('Se reemplazÃ³ la palabra seleccionada');
        }
        alternatives.value = [];
        wordPopover.value = null;
    };
    const rewriteStyles = ['friendly', 'professional', 'simple', 'persuasive', 'shorter'];
    const renderOutput = () => {
        if (isLoading.value && !translatedText.value)
            return (_jsxs("div", { class: styles.skeleton, children: [_jsx("div", { class: styles.skeletonLine, style: { width: '85%' } }), _jsx("div", { class: styles.skeletonLine, style: { width: '70%' } }), _jsx("div", { class: styles.skeletonLine, style: { width: '79%' } })] }));
        if (errorMsg.value)
            return _jsxs("div", { class: `${styles.outputArea} ${styles.error}`, children: ["\u00E2\u0161\u00A0 ", errorMsg.value] });
        if (!translatedText.value)
            return (_jsx("textarea", { class: `${styles.textarea} ${styles.outputTextarea}`, placeholder: "La traducci\u00C3\u00B3n aparecer\u00C3\u00A1 aqu\u00C3\u00AD\u00E2\u20AC\u00A6", value: "", readOnly: true }));
        return (_jsxs("div", { class: styles.outputWrap, children: [isManuallyEdited.value && (_jsx("span", { class: styles.editedBadge, title: "Editado manualmente", children: "\u00E2\u0153\u008F\u00EF\u00B8\u008F Editado" })), _jsx("textarea", { ref: outputRef, class: `${styles.textarea} ${styles.outputTextarea} ${isManuallyEdited.value ? styles.outputEdited : ''}`, onInput: handleOutputEdit, onDblClick: (e) => handleOutputDoubleClick(e), onMouseUp: (e) => handleOutputMouseUp(e), placeholder: "La traducci\u00C3\u00B3n aparecer\u00C3\u00A1 aqu\u00C3\u00AD\u00E2\u20AC\u00A6" })] }));
    };
    const favCount = loadFavorites().length;
    return (_jsxs("div", { class: styles.app, onClick: () => { wordPopover.value = null; }, children: [_jsxs("header", { class: styles.header, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center' }, children: [_jsx("span", { class: styles.logo, children: "Lingo" }), _jsx("span", { class: styles.logoTagline, children: "AI translation for teams" })] }), _jsxs("div", { class: styles.headerActions, children: [_jsx("button", { class: styles.iconBtn, onClick: toggleTheme, title: "Toggle theme", children: darkMode.value ? 'â˜€' : 'â˜¾' }), _jsxs("button", { class: `${styles.textBtn} ${favoritesOpen.value ? styles.textBtnActive : ''}`, onClick: () => { const o = !favoritesOpen.value; closeAllPanels(); favoritesOpen.value = o; }, children: ["\u00E2\u02DC\u2026 Favoritos", favCount > 0 && _jsx("span", { class: styles.panelBadge, children: favCount })] }), _jsx("button", { class: styles.textBtn, onClick: () => { closeAllPanels(); historyOpen.value = true; }, children: "\u00F0\u0178\u2022\u0090 Historial" }), _jsx("button", { class: styles.textBtn, onClick: () => { const o = !glossaryOpen.value; closeAllPanels(); glossaryOpen.value = o; }, children: "\u00F0\u0178\u201C\u2013 Glosario" }), _jsx("button", { class: styles.textBtn, onClick: () => { const o = !settingsOpen.value; closeAllPanels(); settingsOpen.value = o; }, children: "\u00E2\u0161\u2122 Config" })] })] }), _jsx("div", { class: styles.workspace, children: _jsxs("div", { class: styles.translator, children: [_jsxs("div", { class: styles.langBar, children: [_jsxs("div", { class: styles.langBarSide, children: [_jsx(LanguageSelector, { value: sourceLang.value, onChange: handleSourceLang, includeAuto: true }), sourceLang.value === 'auto' && detectedLang.value && (_jsxs("span", { class: styles.detectedBadge, children: ["Detectado: ", getLanguageDisplayName(detectedLang.value)] })), sourceLang.value !== 'auto' && sourceLanguageConflict.value && (_jsxs("button", { class: styles.detectedBadge, onClick: () => handleSourceLang('auto'), title: `Cambiar a deteccion automatica (${getLanguageDisplayName(sourceLanguageConflict.value)})`, children: ["Detectado: ", getLanguageDisplayName(sourceLanguageConflict.value), " \u00C2\u00B7 usar auto"] })), sourceText.value && _jsx("button", { class: styles.clearBtn, onClick: handleClear, title: "Limpiar (Esc)", children: "\u00C3\u2014" })] }), _jsx("button", { class: styles.swapBtn, onClick: handleSwap, title: "Swap (Alt+S)", children: "\u00E2\u2021\u201E" }), _jsxs("div", { class: styles.langBarSide, children: [_jsx(LanguageSelector, { value: targetLang.value, onChange: handleTargetLang }), _jsx("div", { class: styles.langBarDivider }), _jsx(FormalitySelector, { value: formalityMode.value, onChange: handleFormalityChange })] })] }), _jsxs("div", { class: styles.panels, children: [_jsxs("div", { class: styles.panel, children: [_jsx("textarea", { ref: textareaRef, class: styles.textarea, onInput: handleInput, placeholder: "Escribe o pega texto aqu\u00C3\u00AD\u00E2\u20AC\u00A6", maxLength: 5000 }), _jsx("div", { class: styles.sourceFooter, children: _jsxs("span", { class: styles.charCount, children: [sourceText.value.length, " / 5000"] }) })] }), _jsxs("div", { class: styles.panel, children: [renderOutput(), alternatives.value.length > 0 && !isRewriting.value && (_jsxs("div", { class: styles.altSection, children: [_jsx("span", { class: styles.altSectionLabel, children: "Alternativas:" }), alternatives.value.map((alt, i) => (_jsx("div", { class: styles.altLine, onClick: () => { translatedText.value = alt; alternatives.value = []; }, children: alt }, i)))] })), translatedText.value && !errorMsg.value && (_jsxs("div", { class: styles.rewriteBar, children: [_jsx("span", { class: styles.rewriteLabel, children: "Reescribir:" }), rewriteStyles.map((style) => (_jsxs("button", { class: `${styles.rewriteBtn} ${activeRewrite.value === style ? styles.rewriteBtnActive : ''}`, onClick: () => triggerRewrite(style), disabled: isLoading.value || isRewriting.value, children: [isRewriting.value && activeRewrite.value === style ? 'âŸ³ ' : '', REWRITE_LABELS[style]] }, style)))] })), _jsxs("div", { class: styles.targetFooter, children: [_jsxs("span", { class: styles.charCount, children: [translatedText.value.length, " chars", translationHealth.value.count > 0 && (_jsxs(_Fragment, { children: [' ', "\u00C2\u00B7 TTFU ", Math.round(translationHealth.value.avgTTFUMs), "ms", ' ', "\u00C2\u00B7 Avg ", Math.round(translationHealth.value.avgDurationMs), "ms", ' ', "\u00C2\u00B7 Cache ", Math.round(translationHealth.value.avgCacheHitRatio * 100), "%", ' ', "\u00C2\u00B7 RPM ", translationHealth.value.requestsPerMinute.toFixed(1)] }))] }), _jsxs("div", { style: { display: 'flex', gap: '8px', alignItems: 'center' }, children: [_jsx("button", { class: `${styles.favBtn} ${favSaved.value ? styles.favBtnSaved : ''}`, onClick: openSaveModal, disabled: !translatedText.value || isLoading.value, title: "Guardar en favoritos", children: favSaved.value ? 'â˜… Guardado' : 'â˜† Guardar' }), _jsxs("button", { class: `${styles.copyBtn} ${copied.value ? styles.copyBtnSuccess : ''}`, onClick: handleCopy, disabled: !translatedText.value || isLoading.value, title: "Copiar (Alt+C)", children: [_jsx("span", { children: copied.value ? 'âœ“' : 'ðŸ“‹' }), _jsx("span", { children: copied.value ? 'Copiado' : 'Copiar' })] })] })] })] })] }), _jsxs("div", { class: styles.shortcutsBar, children: [_jsx("span", { children: "Alt+T \u00E2\u20AC\u201D Focus" }), _jsx("span", { children: "Alt+C \u00E2\u20AC\u201D Copiar" }), _jsx("span", { children: "Alt+S \u00E2\u20AC\u201D Swap" }), _jsx("span", { children: "Esc \u00E2\u20AC\u201D Limpiar" })] })] }) }), toastMsg.value && (_jsx("div", { class: styles.toast, children: toastMsg.value })), wordPopover.value && (_jsxs(_Fragment, { children: [_jsx("div", { class: styles.wordPopoverOverlay, onClick: () => { cancelWordAlternativesFetch(); wordPopover.value = null; } }), _jsxs("div", { class: styles.wordPopover, style: { left: `${wordPopover.value.x}px`, top: `${wordPopover.value.y}px` }, onClick: (e) => e.stopPropagation(), children: [_jsxs("div", { class: styles.wordPopoverTitle, children: [wordPopover.value.isPhrase ? 'Frase' : 'Alternativas', ": \u00C2\u00AB", wordPopover.value.word.length > 30 ? wordPopover.value.word.slice(0, 30) + 'â€¦' : wordPopover.value.word, "\u00C2\u00BB"] }), _jsx("div", { class: styles.wordPopoverScroll, children: wordPopover.value.loading
                                    ? _jsx("div", { class: styles.wordPopoverLoading, children: "Buscando alternativas\u00E2\u20AC\u00A6" })
                                    : wordPopover.value.alts.length === 0
                                        ? _jsx("div", { class: styles.wordPopoverLoading, children: "Sin alternativas" })
                                        : wordPopover.value.alts.map((alt, i) => (_jsx("button", { class: styles.wordPopoverItem, onClick: () => handlePickWordAlt(alt), children: alt }, i))) })] })] })), saveModalOpen && (_jsxs(_Fragment, { children: [_jsx("div", { class: styles.modalOverlay, onClick: () => setSaveModalOpen(false) }), _jsxs("div", { class: styles.modal, children: [_jsxs("div", { class: styles.modalHeader, children: [_jsx("span", { class: styles.modalTitle, children: "\u00E2\u02DC\u2026 Guardar como favorito" }), _jsx("button", { onClick: () => setSaveModalOpen(false), style: { background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: 'var(--clr-text-3)' }, children: "\u00C3\u2014" })] }), _jsx("label", { class: styles.modalLabel, children: "Nombre del favorito" }), _jsx("input", { class: styles.modalInput, type: "text", value: favName, onInput: (e) => setFavName(e.target.value), onKeyDown: (e) => { if (e.key === 'Enter')
                                    confirmSaveFavorite(); }, maxLength: 80, autoFocus: true, placeholder: "Ej: Respuesta de bienvenida en ingl\u00C3\u00A9s" }), _jsxs("div", { class: styles.modalPreview, children: [_jsxs("div", { class: styles.modalPreviewRow, children: [_jsxs("span", { class: styles.modalPreviewLang, children: [effectiveSource.value.toUpperCase(), " \u00E2\u2020\u2019 ", targetLang.value.toUpperCase()] }), _jsx("span", { class: styles.modalPreviewMeta, children: formalityMode.value })] }), _jsxs("div", { class: styles.modalPreviewText, children: [sourceText.value.slice(0, 100), sourceText.value.length > 100 ? 'â€¦' : ''] }), _jsxs("div", { class: styles.modalPreviewTranslation, children: [translatedText.value.slice(0, 100), translatedText.value.length > 100 ? 'â€¦' : ''] })] }), _jsxs("div", { class: styles.modalActions, children: [_jsx("button", { class: styles.modalCancelBtn, onClick: () => setSaveModalOpen(false), children: "Cancelar" }), _jsx("button", { class: styles.modalSaveBtn, onClick: confirmSaveFavorite, disabled: !favName.trim(), children: "\u00E2\u02DC\u2026 Guardar favorito" })] })] })] })), settingsOpen.value && _jsx(SettingsPanel, { onClose: () => { settingsOpen.value = false; } }), glossaryOpen.value && _jsx(GlossaryPanel, { onClose: () => { glossaryOpen.value = false; }, sourceLang: effectiveSource.value, targetLang: targetLang.value }), historyOpen.value && _jsx(HistoryPanel, { onClose: () => { historyOpen.value = false; }, onRestore: handleRestoreHistory }), favoritesOpen.value && _jsx(FavoritesPanel, { onClose: () => { favoritesOpen.value = false; }, onRestore: handleRestoreFavorite })] }));
}
