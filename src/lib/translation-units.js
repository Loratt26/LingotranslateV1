export function hashText(value) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}
export function splitIntoTranslationSegments(text) {
    return text.split(/(\n+)/);
}
export function normalizeTranslatedSegments(sourceSegments, translatedSegments) {
    if (sourceSegments.length === translatedSegments.length) {
        return translatedSegments;
    }
    const normalized = [];
    let translatedIndex = 0;
    const lastTranslatableIndex = sourceSegments.reduce((lastIndex, segment, index) => (isTranslatableSegment(segment) ? index : lastIndex), -1);
    for (let sourceIndex = 0; sourceIndex < sourceSegments.length; sourceIndex += 1) {
        const sourceSegment = sourceSegments[sourceIndex];
        if (!isTranslatableSegment(sourceSegment)) {
            const candidate = translatedSegments[translatedIndex];
            if (candidate === sourceSegment) {
                normalized.push(candidate);
                translatedIndex += 1;
            }
            else {
                normalized.push(sourceSegment);
            }
            continue;
        }
        const remainingTranslatable = sourceSegments.slice(sourceIndex + 1).filter(isTranslatableSegment).length;
        const remainingSlots = translatedSegments.length - translatedIndex;
        const takeCount = Math.max(1, remainingSlots - remainingTranslatable);
        normalized.push(translatedSegments.slice(translatedIndex, translatedIndex + takeCount).join(''));
        translatedIndex += takeCount;
    }
    if (translatedIndex < translatedSegments.length) {
        const trailing = translatedSegments.slice(translatedIndex).join('');
        const anchorIndex = lastTranslatableIndex >= 0 ? lastTranslatableIndex : Math.max(sourceSegments.length - 1, 0);
        normalized[anchorIndex] = `${normalized[anchorIndex] ?? ''}${trailing}`;
    }
    return normalized;
}
export function isTranslatableSegment(segment) {
    return segment.trim().length > 0 && !/^\n+$/.test(segment);
}
export function composeTextFromUnits(units) {
    return units.map((unit) => unit.translation).join('');
}
export function distributeTranslationAcrossSourceSegments(sourceSegments, translatedText) {
    if (sourceSegments.length === 0)
        return [];
    const translatedSegments = splitIntoTranslationSegments(translatedText);
    if (translatedSegments.length === sourceSegments.length)
        return translatedSegments;
    const normalizedSegments = normalizeTranslatedSegments(sourceSegments, translatedSegments);
    if (normalizedSegments.join('') === translatedText && normalizedSegments.length === sourceSegments.length) {
        return normalizedSegments;
    }
    const assigned = sourceSegments.map(() => '');
    const lastTranslatableIndex = sourceSegments.reduce((lastIndex, segment, index) => (isTranslatableSegment(segment) ? index : lastIndex), -1);
    let targetIndex = 0;
    for (let sourceIndex = 0; sourceIndex < sourceSegments.length; sourceIndex += 1) {
        const sourceSegment = sourceSegments[sourceIndex];
        if (!isTranslatableSegment(sourceSegment)) {
            const candidate = translatedSegments[targetIndex];
            if (candidate === sourceSegment) {
                assigned[sourceIndex] = candidate;
                targetIndex += 1;
            }
            continue;
        }
        const nextBoundaryIndex = sourceSegments.findIndex((segment, index) => index > sourceIndex &&
            !isTranslatableSegment(segment));
        const nextBoundary = nextBoundaryIndex >= 0 ? sourceSegments[nextBoundaryIndex] : null;
        let chunk = '';
        while (targetIndex < translatedSegments.length) {
            const currentTranslated = translatedSegments[targetIndex];
            if (nextBoundary && currentTranslated === nextBoundary)
                break;
            chunk += currentTranslated;
            targetIndex += 1;
        }
        assigned[sourceIndex] = chunk;
    }
    if (targetIndex < translatedSegments.length) {
        const remaining = translatedSegments.slice(targetIndex).join('');
        const appendIndex = lastTranslatableIndex >= 0 ? lastTranslatableIndex : sourceSegments.length - 1;
        assigned[appendIndex] = `${assigned[appendIndex] ?? ''}${remaining}`;
    }
    if (assigned.join('') !== translatedText) {
        const fallback = sourceSegments.map(() => '');
        const anchorIndex = lastTranslatableIndex >= 0 ? lastTranslatableIndex : 0;
        fallback[anchorIndex] = translatedText;
        return fallback;
    }
    return assigned;
}
export function buildUnits(segments, options, previousUnits = []) {
    const now = options.now ?? Date.now();
    const previousPool = new Map();
    for (const previousUnit of previousUnits) {
        const key = `${previousUnit.sourceLang}|${previousUnit.targetLang}|${previousUnit.source}`;
        const queue = previousPool.get(key) ?? [];
        queue.push(previousUnit);
        previousPool.set(key, queue);
    }
    return segments.map((segment, index) => {
        const checksum = hashText(segment);
        const key = `${options.sourceLang}|${options.targetLang}|${segment}`;
        const reusedQueue = previousPool.get(key);
        const reused = reusedQueue?.shift();
        const fallbackTranslation = isTranslatableSegment(segment) ? '' : segment;
        const createdAt = reused?.createdAt ?? now;
        const status = isTranslatableSegment(segment)
            ? (reused?.status ?? 'queued')
            : 'translated';
        return {
            id: reused?.id ?? `${index}-${checksum}`,
            source: segment,
            translation: reused?.translation ?? fallbackTranslation,
            checksum,
            status,
            createdAt,
            updatedAt: now,
            version: reused ? reused.version + 1 : 1,
            sourceLang: options.sourceLang,
            targetLang: options.targetLang,
            confidence: options.confidence,
            ...(reused?.lastError ? { lastError: reused.lastError } : {}),
        };
    });
}
export function updateUnit(units, index, patch, now = Date.now()) {
    if (index < 0 || index >= units.length)
        return units;
    const current = units[index];
    const next = {
        ...current,
        ...patch,
        updatedAt: now,
        version: current.version + 1,
    };
    if (patch.status && patch.status !== 'error' && next.lastError) {
        delete next.lastError;
    }
    return units.map((unit, unitIndex) => (unitIndex === index ? next : unit));
}
export function hydrateTranslatedUnits(units, translatedText, now = Date.now()) {
    if (units.length === 0)
        return [];
    const alignedTranslations = distributeTranslationAcrossSourceSegments(units.map((unit) => unit.source), translatedText);
    return units.map((unit, index) => ({
        ...unit,
        translation: alignedTranslations[index] ?? '',
        status: 'translated',
        updatedAt: now,
        version: unit.version + 1,
        ...(unit.lastError ? { lastError: undefined } : {}),
    }));
}
export function countTranslatableUnits(units) {
    return units.filter((unit) => isTranslatableSegment(unit.source)).length;
}
export function countTranslatedUnits(units) {
    return units.filter((unit) => unit.status === 'translated').length;
}
