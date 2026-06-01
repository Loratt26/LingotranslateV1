import { storage } from './storage';
const DEFAULT_PROXY_URL = '/api/openai';
const REQUEST_TIMEOUT_MS = 25000;
function sanitizeProxyEndpoint(value) {
    const candidate = value.trim();
    if (!candidate)
        return '';
    if (candidate.startsWith('/api/'))
        return candidate;
    if (candidate === DEFAULT_PROXY_URL)
        return DEFAULT_PROXY_URL;
    try {
        const parsed = new URL(candidate, window.location.origin);
        if (parsed.origin === window.location.origin && parsed.pathname.startsWith('/api/')) {
            return `${parsed.pathname}${parsed.search}${parsed.hash}`;
        }
    }
    catch {
        // Invalid URL means we should reset to default proxy.
    }
    return '';
}
function getEndpointConfig(accessToken) {
    const customUrl = sanitizeProxyEndpoint(storage.getProxyUrl());
    if (!customUrl && storage.getProxyUrl().trim()) {
        storage.setProxyUrl('');
    }
    const headers = { 'Content-Type': 'application/json' };
    const token = accessToken.trim();
    if (token) {
        headers['X-Extension-Token'] = token;
    }
    return {
        url: customUrl || DEFAULT_PROXY_URL,
        headers,
        usingCustomEndpoint: customUrl.length > 0,
    };
}
function looksLikeHtml(raw, contentType) {
    if (contentType?.toLowerCase().includes('text/html'))
        return true;
    return /^\s*<!doctype html\b|^\s*<html\b/i.test(raw) || /<body\b|<head\b|class\s*=\s*["']no-js/i.test(raw);
}
function buildEndpointMismatchMessage() {
    return 'El endpoint personalizado devolvio una pagina HTML en vez de JSON. Se restablecio el proxy seguro de Vercel.';
}
function buildGenericErrorMessage(response, raw) {
    if (looksLikeHtml(raw, response.headers.get('content-type'))) {
        return buildEndpointMismatchMessage();
    }
    try {
        const parsed = JSON.parse(raw);
        if (typeof parsed.error === 'string') {
            if (looksLikeHtml(parsed.error, null))
                return buildEndpointMismatchMessage();
            return parsed.error;
        }
    }
    catch {
        // Fall through to raw text.
    }
    return raw || `Error ${response.status}`;
}
async function requestOpenAIEndpoint(url, headers, request) {
    const timeoutController = new AbortController();
    const timer = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);
    const externalAbort = () => timeoutController.abort();
    if (request.signal) {
        if (request.signal.aborted)
            timeoutController.abort();
        request.signal.addEventListener('abort', externalAbort, { once: true });
    }
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers,
            signal: timeoutController.signal,
            body: JSON.stringify({
                traceId: request.traceId,
                model: storage.getOpenAIModel(),
                system: request.system,
                input: request.input,
                maxOutputTokens: request.maxOutputTokens,
                temperature: request.temperature,
                stream: request.stream === true,
            }),
        });
        return {
            response,
            raw: await response.text(),
        };
    }
    finally {
        clearTimeout(timer);
        request.signal?.removeEventListener('abort', externalAbort);
    }
}
function buildTimeoutSignal(signal) {
    const timeoutController = new AbortController();
    const timer = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);
    const externalAbort = () => timeoutController.abort();
    if (signal) {
        if (signal.aborted)
            timeoutController.abort();
        signal.addEventListener('abort', externalAbort, { once: true });
    }
    return {
        signal: timeoutController.signal,
        cleanup: () => {
            clearTimeout(timer);
            signal?.removeEventListener('abort', externalAbort);
        },
    };
}
async function requestOpenAIStreamEndpoint(url, headers, request) {
    const timeout = buildTimeoutSignal(request.signal);
    try {
        return await fetch(url, {
            method: 'POST',
            headers,
            signal: timeout.signal,
            body: JSON.stringify({
                traceId: request.traceId,
                model: storage.getOpenAIModel(),
                system: request.system,
                input: request.input,
                maxOutputTokens: request.maxOutputTokens,
                temperature: request.temperature,
                stream: true,
            }),
        });
    }
    finally {
        timeout.cleanup();
    }
}
function parseSSEPayload(rawEvent) {
    return rawEvent
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart());
}
function splitSSEEvents(buffer) {
    const normalized = buffer.replace(/\r\n/g, '\n');
    const events = normalized.split('\n\n');
    const rest = events.pop() ?? '';
    return { events, rest };
}
function applyStreamPayload(payload, onDelta, state) {
    if (!payload || payload === '[DONE]')
        return;
    let parsed;
    try {
        parsed = JSON.parse(payload);
    }
    catch {
        return;
    }
    if (parsed.type === 'error' && parsed.error) {
        throw new Error(parsed.error);
    }
    if (parsed.type === 'delta' && typeof parsed.delta === 'string' && parsed.delta.length > 0) {
        state.text += parsed.delta;
        onDelta(parsed.delta);
    }
    if (parsed.type === 'done') {
        state.model = parsed.model ?? state.model;
        state.inputTokens = Number(parsed.usage?.inputTokens ?? state.inputTokens);
        state.outputTokens = Number(parsed.usage?.outputTokens ?? state.outputTokens);
        if (typeof parsed.text === 'string' && parsed.text.trim().length > 0) {
            state.text = parsed.text;
        }
    }
}
async function readOpenAIStream(response, onDelta) {
    const reader = response.body?.getReader();
    if (!reader)
        throw new Error('El proxy devolvio un stream vacio.');
    let buffer = '';
    const state = {
        text: '',
        model: storage.getOpenAIModel(),
        inputTokens: 0,
        outputTokens: 0,
    };
    const decoder = new TextDecoder();
    while (true) {
        const { value, done } = await reader.read();
        if (done)
            break;
        buffer += decoder.decode(value, { stream: true });
        const extracted = splitSSEEvents(buffer);
        buffer = extracted.rest;
        for (const event of extracted.events) {
            const payloads = parseSSEPayload(event);
            for (const payload of payloads) {
                applyStreamPayload(payload, onDelta, state);
            }
        }
    }
    if (buffer.trim().length > 0) {
        for (const payload of parseSSEPayload(buffer.replace(/\r\n/g, '\n'))) {
            applyStreamPayload(payload, onDelta, state);
        }
    }
    return {
        text: state.text,
        model: state.model,
        inputTokens: state.inputTokens,
        outputTokens: state.outputTokens,
    };
}
export async function generateOpenAIText(request, accessToken) {
    const { url, headers, usingCustomEndpoint } = getEndpointConfig(accessToken);
    let response;
    let raw;
    try {
        ({ response, raw } = await requestOpenAIEndpoint(url, headers, request));
    }
    catch (err) {
        if (err.name === 'AbortError') {
            throw new Error('Tiempo de espera agotado al conectar con OpenAI.');
        }
        throw err;
    }
    const shouldFallback = usingCustomEndpoint &&
        url !== DEFAULT_PROXY_URL &&
        looksLikeHtml(raw, response.headers.get('content-type'));
    if (shouldFallback) {
        storage.setProxyUrl('');
        try {
            ({ response, raw } = await requestOpenAIEndpoint(DEFAULT_PROXY_URL, headers, request)); // fallback to the built-in Vercel proxy
        }
        catch (err) {
            if (err.name === 'AbortError') {
                throw new Error('Tiempo de espera agotado al conectar con OpenAI.');
            }
            throw err;
        }
    }
    if (!response.ok) {
        if (response.status === 504)
            throw new Error('El proxy agotÃ³ el tiempo de espera. Intenta de nuevo.');
        const message = buildGenericErrorMessage(response, raw);
        if (response.status === 401)
            throw new Error(message || 'Credenciales de OpenAI invalidas.');
        if (response.status === 429)
            throw new Error(message || 'Rate limit alcanzado. Espera un momento.');
        throw new Error(message.slice(0, 220));
    }
    if (looksLikeHtml(raw, response.headers.get('content-type'))) {
        throw new Error(buildEndpointMismatchMessage());
    }
    let data;
    try {
        data = JSON.parse(raw);
    }
    catch {
        throw new Error('El proxy devolvio una respuesta invalida. Intenta de nuevo.');
    }
    return {
        text: data.text ?? '',
        model: data.model ?? storage.getOpenAIModel(),
        inputTokens: Number(data.usage?.inputTokens ?? 0),
        outputTokens: Number(data.usage?.outputTokens ?? 0),
    };
}
export async function generateOpenAITextStream(request, accessToken) {
    const { url, headers, usingCustomEndpoint } = getEndpointConfig(accessToken);
    let response;
    try {
        response = await requestOpenAIStreamEndpoint(url, headers, { ...request, stream: true });
    }
    catch (err) {
        if (err.name === 'AbortError') {
            throw new Error('Tiempo de espera agotado al conectar con OpenAI.');
        }
        throw err;
    }
    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
    const shouldFallback = usingCustomEndpoint &&
        url !== DEFAULT_PROXY_URL &&
        !contentType.includes('text/event-stream');
    if (shouldFallback) {
        storage.setProxyUrl('');
        try {
            response = await requestOpenAIStreamEndpoint(DEFAULT_PROXY_URL, headers, { ...request, stream: true });
        }
        catch (err) {
            if (err.name === 'AbortError') {
                throw new Error('Tiempo de espera agotado al conectar con OpenAI.');
            }
            throw err;
        }
    }
    if (!response.ok) {
        const raw = await response.text();
        const message = buildGenericErrorMessage(response, raw);
        if (response.status === 401)
            throw new Error(message || 'Credenciales de OpenAI invalidas.');
        if (response.status === 429)
            throw new Error(message || 'Rate limit alcanzado. Espera un momento.');
        throw new Error(message.slice(0, 220));
    }
    return readOpenAIStream(response, request.onDelta);
}
