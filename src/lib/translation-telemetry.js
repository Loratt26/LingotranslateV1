const TRACE_LIMIT = 200;
const traces = [];
function isDebugEnabled() {
    try {
        return localStorage.getItem('lingo_debug_metrics') === '1';
    }
    catch {
        return false;
    }
}
function writeDebug(event, payload) {
    if (!isDebugEnabled())
        return;
    const line = {
        event,
        ts: new Date().toISOString(),
        ...payload,
    };
    console.debug('[lingo-metrics]', JSON.stringify(line));
}
export function startTranslationTrace(trace) {
    const created = {
        ...trace,
        startedAt: performance.now(),
        cancelled: false,
    };
    traces.unshift(created);
    if (traces.length > TRACE_LIMIT)
        traces.length = TRACE_LIMIT;
    writeDebug('translation.start', {
        requestId: created.requestId,
        sourceChars: created.sourceChars,
        sourceLang: created.sourceLang,
        targetLang: created.targetLang,
        unitsTotal: created.unitsTotal,
    });
    return created;
}
export function markFirstTranslationUpdate(trace) {
    if (trace.firstUpdateAt !== undefined)
        return;
    trace.firstUpdateAt = performance.now();
    writeDebug('translation.first_update', {
        requestId: trace.requestId,
        ttfuMs: trace.firstUpdateAt - trace.startedAt,
    });
}
export function finalizeTranslationTrace(trace, patch) {
    Object.assign(trace, patch);
    trace.completedAt = performance.now();
    writeDebug('translation.end', {
        requestId: trace.requestId,
        durationMs: trace.completedAt - trace.startedAt,
        ttfuMs: trace.firstUpdateAt !== undefined ? trace.firstUpdateAt - trace.startedAt : null,
        unitsTranslated: trace.unitsTranslated,
        unitsTotal: trace.unitsTotal,
        cacheHits: trace.cacheHits,
        cancelled: trace.cancelled,
        inputTokens: trace.inputTokens,
        outputTokens: trace.outputTokens,
        error: trace.error ?? null,
    });
}
export function getTranslationTraceSnapshot() {
    return traces.map((trace) => ({ ...trace }));
}
export function getTranslationMetricsSummary() {
    const completed = traces.filter((trace) => trace.completedAt !== undefined && !trace.cancelled);
    const finished = traces.filter((trace) => trace.completedAt !== undefined);
    const cancelledCount = finished.filter((trace) => trace.cancelled).length;
    const errorCount = finished.filter((trace) => Boolean(trace.error)).length;
    const oldest = finished[finished.length - 1];
    const newest = finished[0];
    const minuteSpan = oldest && newest
        ? Math.max(((newest.completedAt ?? newest.startedAt) - oldest.startedAt) / 60000, 1 / 60)
        : 1 / 60;
    const requestsPerMinute = finished.length > 0 ? finished.length / minuteSpan : 0;
    if (completed.length === 0) {
        return {
            count: 0,
            totalFinished: finished.length,
            cancelledCount,
            errorCount,
            cancelRate: finished.length > 0 ? cancelledCount / finished.length : 0,
            errorRate: finished.length > 0 ? errorCount / finished.length : 0,
            requestsPerMinute,
            avgDurationMs: 0,
            avgTTFUMs: 0,
            avgTokensPerRequest: 0,
            avgCacheHitRatio: 0,
        };
    }
    const totals = completed.reduce((acc, trace) => {
        const duration = (trace.completedAt ?? trace.startedAt) - trace.startedAt;
        const ttfu = trace.firstUpdateAt !== undefined ? trace.firstUpdateAt - trace.startedAt : duration;
        return {
            duration: acc.duration + duration,
            ttfu: acc.ttfu + ttfu,
            tokens: acc.tokens + trace.inputTokens + trace.outputTokens,
            cacheRatio: acc.cacheRatio + (trace.unitsTotal > 0 ? trace.cacheHits / trace.unitsTotal : 0),
        };
    }, { duration: 0, ttfu: 0, tokens: 0, cacheRatio: 0 });
    return {
        count: completed.length,
        totalFinished: finished.length,
        cancelledCount,
        errorCount,
        cancelRate: finished.length > 0 ? cancelledCount / finished.length : 0,
        errorRate: finished.length > 0 ? errorCount / finished.length : 0,
        requestsPerMinute,
        avgDurationMs: totals.duration / completed.length,
        avgTTFUMs: totals.ttfu / completed.length,
        avgTokensPerRequest: totals.tokens / completed.length,
        avgCacheHitRatio: totals.cacheRatio / completed.length,
    };
}
export function resetTranslationMetrics() {
    traces.length = 0;
}
