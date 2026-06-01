const OPENAI_BASE_URL = 'https://api.openai.com/v1';
const CHAT_COMPLETIONS_MODE = 'chat_completions';
const RESPONSES_MODE = 'responses';

// Mapeo de IDs de UI a modelos reales de OpenAI.
// Los IDs visibles (gpt-5.5, claude-*, minimax-*, etc.) son etiquetas internas
// que no existen en api.openai.com. Sin este mapa cada llamada al upstream
// fallaba y degradaba al siguiente del fallback, gastando segundos por intento.
const MODEL_ID_MAP = {
  'gpt-5.5':           'gpt-4o',
  'gpt-5.4-mini':      'gpt-4o-mini',
  'gpt-5.4':           'gpt-4o',
  'gpt-5.4-nano':      'gpt-4o-mini',
  'gpt-5.3-codex':     'gpt-4o',
  'gpt-5.2-codex':     'gpt-4o',
  'gpt-5.2':           'gpt-4o',
  'claude-haiku-4.5':  'gpt-4o-mini',
  'claude-sonnet-4':   'gpt-4o',
  'claude-sonnet-4.5': 'gpt-4o',
  'claude-sonnet-4.6': 'gpt-4o',
  'claude-opus-4.5':   'gpt-4o',
  'claude-opus-4.6':   'gpt-4o',
  'claude-opus-4.7':   'gpt-4o',
  'minimax-m2.1':      'gpt-4o-mini',
  'minimax-m2.5':      'gpt-4o-mini',
  'deepseek-3.2':      'gpt-4o',
  'qwen3-coder-next':  'gpt-4o',
  'glm-5':             'gpt-4o',
  'auto':              'gpt-4o-mini',
};

export function resolveModelId(uiId) {
  if (!uiId) return '';
  const key = String(uiId).trim().toLowerCase();
  return MODEL_ID_MAP[key] || uiId;
}

export const DEFAULT_MODEL = 'gpt-4o-mini';
export const FALLBACK_MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo'];
const REQUEST_TIMEOUT_MS = 22_000;
const MAX_ATTEMPTS_PER_MODEL = 2;
const TRACE_HEADER = 'x-lingo-trace-id';
const TRACE_LOGS_ENABLED = process.env.LINGO_TRACE_LOGS !== '0';

function resolveTraceId(body, req) {
  const bodyTrace = String(body?.traceId ?? '').trim();
  if (bodyTrace) return bodyTrace.slice(0, 80);
  const headerTrace = String(getHeader(req, TRACE_HEADER) ?? '').trim();
  if (headerTrace) return headerTrace.slice(0, 80);
  return `srv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function writeTrace(event, traceId, payload = {}) {
  if (!TRACE_LOGS_ENABLED) return;
  console.log(JSON.stringify({
    event,
    traceId,
    ts: new Date().toISOString(),
    ...payload,
  }));
}

function normalizeRequestedModel(model) {
  if (!model) return '';
  const normalized = String(model).trim();
  if (!normalized || normalized.toLowerCase() === 'auto') return '';
  return resolveModelId(normalized);
}

export function buildModelAttempts(requestedModel) {
  const configuredDefault = resolveModelId(process.env.OPENAI_DEFAULT_MODEL || DEFAULT_MODEL);
  const normalizedRequested = normalizeRequestedModel(requestedModel);
  return [...new Set([
    normalizedRequested,
    configuredDefault,
    ...FALLBACK_MODELS.map(resolveModelId),
  ].filter(Boolean))];
}

export function buildUpstreamUrl(mode, exactUrl, baseUrl) {
  const normalizedMode = mode === CHAT_COMPLETIONS_MODE ? CHAT_COMPLETIONS_MODE : RESPONSES_MODE;
  const routePath = normalizedMode === CHAT_COMPLETIONS_MODE ? 'chat/completions' : 'responses';

  if (exactUrl) return String(exactUrl).trim().replace(/\/+$/, '');

  const configuredBase = String(baseUrl || OPENAI_BASE_URL).trim().replace(/\/+$/, '');
  if (/\/(?:responses|chat\/completions)$/i.test(configuredBase)) return configuredBase;
  if (/\/v\d+$/i.test(configuredBase)) return `${configuredBase}/${routePath}`;
  return `${configuredBase}/v1/${routePath}`;
}

export function extractOutputText(data) {
  if (typeof data?.output_text === 'string') return data.output_text;

  const chunks = [];
  for (const item of data?.output ?? []) {
    for (const content of item?.content ?? []) {
      if (typeof content?.text === 'string') chunks.push(content.text);
    }
  }

  if (chunks.length > 0) return chunks.join('');

  return (data?.choices ?? [])
    .map((choice) => choice?.message?.content ?? choice?.text ?? '')
    .join('');
}

export function getTokenUsage(data) {
  return {
    inputTokens: Number(data?.usage?.input_tokens ?? data?.usage?.prompt_tokens ?? 0),
    outputTokens: Number(data?.usage?.output_tokens ?? data?.usage?.completion_tokens ?? 0),
  };
}

function getHeader(req, name) {
  const value = req.headers?.[name.toLowerCase()] ?? req.headers?.[name];
  return Array.isArray(value) ? value[0] : value;
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function cleanNumber(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function getUpstreamMode() {
  const mode = process.env.OPENAI_UPSTREAM_MODE || process.env.OPENAI_API_MODE || RESPONSES_MODE;
  return mode === CHAT_COMPLETIONS_MODE ? CHAT_COMPLETIONS_MODE : RESPONSES_MODE;
}

function getRetryDelayMs(attempt) {
  return attempt === 0 ? 0 : 180;
}

export function buildAuthHeaderValue(apiKey, scheme) {
  const normalizedScheme = String(scheme ?? 'Bearer').trim();
  if (!normalizedScheme || /^(none|raw)$/i.test(normalizedScheme)) return apiKey;
  return `${normalizedScheme} ${apiKey}`;
}

function buildAuthHeaders(apiKey) {
  const headerName = process.env.OPENAI_AUTH_HEADER || 'Authorization';
  const value = buildAuthHeaderValue(apiKey, process.env.OPENAI_AUTH_SCHEME ?? 'Bearer');
  return {
    [headerName]: value,
    'Content-Type': 'application/json',
  };
}

function buildRequestPayload(body, model, mode, includeTemperature = true) {
  const maxTokens = cleanNumber(body.maxOutputTokens, 1024, 1, 4096);
  const stream = body.stream === true;
  const payload = mode === CHAT_COMPLETIONS_MODE
    ? {
        model,
        messages: [
          { role: 'system', content: String(body.system ?? '') },
          { role: 'user', content: String(body.input ?? '') },
        ],
        max_tokens: maxTokens,
        stream,
      }
    : {
        model,
        instructions: String(body.system ?? ''),
        input: String(body.input ?? ''),
        max_output_tokens: maxTokens,
        store: false,
        stream,
      };

  if (includeTemperature && body.temperature !== undefined) {
    payload.temperature = cleanNumber(body.temperature, 0, 0, 2);
  }

  return payload;
}

export function looksLikeHtmlPayload(raw, contentType) {
  const normalizedType = String(contentType || '').toLowerCase();
  if (normalizedType.includes('text/html')) return true;
  const normalizedRaw = String(raw || '');
  return /^\s*<!doctype html\b|^\s*<html\b/i.test(normalizedRaw) ||
    /<body\b|<head\b|class\s*=\s*["']no-js/i.test(normalizedRaw);
}

export function parseOpenAIError(raw, contentType) {
  if (looksLikeHtmlPayload(raw, contentType)) {
    return 'El proveedor de IA devolvio una pagina HTML no valida.';
  }

  try {
    const parsed = JSON.parse(raw);
    return String(parsed?.error?.message ?? raw);
  } catch {
    return String(raw);
  }
}

function isModelError(status, message) {
  return [400, 404].includes(status) &&
    /(model|does not exist|not found|not available|unsupported)/i.test(message);
}

function isTemperatureError(status, message) {
  return status === 400 && /temperature/i.test(message);
}

function toInteger(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function createUsage() {
  return { inputTokens: 0, outputTokens: 0 };
}

function getChatChoiceDelta(parsed) {
  const choice = parsed?.choices?.[0];
  const content = choice?.delta?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .join('');
  }
  return '';
}

function getResponsesDelta(parsed) {
  if (typeof parsed?.delta === 'string' && parsed.type === 'response.output_text.delta') {
    return parsed.delta;
  }

  const outputText = parsed?.output?.flatMap?.((item) => (
    item?.content?.map?.((content) => (typeof content?.text === 'string' ? content.text : '')) ?? []
  ));
  if (Array.isArray(outputText) && outputText.length > 0) {
    return outputText.join('');
  }

  return '';
}

function extractStreamDelta(parsed, mode) {
  if (mode === CHAT_COMPLETIONS_MODE) return getChatChoiceDelta(parsed);
  return getResponsesDelta(parsed);
}

function updateUsageFromStreamEvent(parsed, usage, mode) {
  if (mode === CHAT_COMPLETIONS_MODE) {
    const eventUsage = parsed?.usage;
    if (!eventUsage) return;
    usage.inputTokens = toInteger(eventUsage.prompt_tokens, usage.inputTokens);
    usage.outputTokens = toInteger(eventUsage.completion_tokens, usage.outputTokens);
    return;
  }

  const eventUsage = parsed?.response?.usage ?? parsed?.usage;
  if (!eventUsage) return;
  usage.inputTokens = toInteger(eventUsage.input_tokens, usage.inputTokens);
  usage.outputTokens = toInteger(eventUsage.output_tokens, usage.outputTokens);
}

function sendSSE(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function splitSSEEvents(buffer) {
  const normalized = buffer.replace(/\r\n/g, '\n');
  const events = normalized.split('\n\n');
  const rest = events.pop() ?? '';
  return { events, rest };
}

function parseSSEDataPayloads(rawEvent) {
  return rawEvent
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart());
}

async function relayOpenAIStream(res, upstream, model, mode, traceId) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  const reader = upstream.body?.getReader?.();
  if (!reader) {
    sendSSE(res, {
      type: 'done',
      text: '',
      model,
      usage: createUsage(),
    });
    res.end('data: [DONE]\n\n');
    return;
  }

  const usage = createUsage();
  let aggregatedText = '';
  let buffer = '';
  const decoder = new TextDecoder();

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const extracted = splitSSEEvents(buffer);
    buffer = extracted.rest;

    for (const event of extracted.events) {
      const lines = parseSSEDataPayloads(event);

      for (const payload of lines) {
        if (!payload || payload === '[DONE]') continue;
        let parsed;
        try {
          parsed = JSON.parse(payload);
        } catch {
          continue;
        }

        const delta = extractStreamDelta(parsed, mode);
        if (delta) {
          aggregatedText += delta;
          sendSSE(res, { type: 'delta', delta });
        }
        updateUsageFromStreamEvent(parsed, usage, mode);
      }
    }
  }

  if (buffer.trim().length > 0) {
    const trailingPayloads = parseSSEDataPayloads(buffer.replace(/\r\n/g, '\n'));
    for (const payload of trailingPayloads) {
      if (!payload || payload === '[DONE]') continue;
      let parsed;
      try {
        parsed = JSON.parse(payload);
      } catch {
        continue;
      }

      const delta = extractStreamDelta(parsed, mode);
      if (delta) {
        aggregatedText += delta;
        sendSSE(res, { type: 'delta', delta });
      }
      updateUsageFromStreamEvent(parsed, usage, mode);
    }
  }

  sendSSE(res, {
    type: 'done',
    text: aggregatedText,
    model,
    usage,
  });
  writeTrace('stream.relay.done', traceId, {
    model,
    chars: aggregatedText.length,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
  });
  res.end('data: [DONE]\n\n');
}

async function callOpenAI(apiKey, body, model, traceId) {
  let includeTemperature = true;
  const mode = getUpstreamMode();
  const upstreamUrl = buildUpstreamUrl(
    mode,
    process.env.OPENAI_UPSTREAM_URL,
    process.env.OPENAI_BASE_URL,
  );

  for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_MODEL; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, getRetryDelayMs(attempt)));
    }
    const timeoutController = new AbortController();
    const timer = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);
    const startedAt = Date.now();
    writeTrace('upstream.attempt.start', traceId, {
      model,
      mode,
      stream: body.stream === true,
      includeTemperature,
      attempt: attempt + 1,
    });

    try {
      const upstream = await fetch(upstreamUrl, {
        method: 'POST',
        headers: buildAuthHeaders(apiKey),
        signal: timeoutController.signal,
        body: JSON.stringify(buildRequestPayload(body, model, mode, includeTemperature)),
      });

      if (upstream.ok && body.stream === true) {
        const contentType = upstream.headers.get('content-type')?.toLowerCase() ?? '';
        if (!contentType.includes('text/event-stream')) {
          const raw = await upstream.text();
          const message = parseOpenAIError(raw, contentType);
          if (attempt === 0) {
            writeTrace('upstream.attempt.retry_invalid_stream', traceId, {
              model,
              mode,
              attempt: attempt + 1,
              contentType: contentType.slice(0, 120),
            });
            continue;
          }
          writeTrace('upstream.attempt.invalid_stream_content_type', traceId, {
            model,
            mode,
            attempt: attempt + 1,
            contentType: contentType.slice(0, 120),
            durationMs: Date.now() - startedAt,
            error: message.slice(0, 180),
          });
          if (attempt === 0) {
            continue;
          }
          return {
            ok: false,
            status: 502,
            message,
            model,
            mode,
          };
        }

        writeTrace('upstream.attempt.end', traceId, {
          model,
          status: upstream.status,
          mode,
          stream: true,
          durationMs: Date.now() - startedAt,
          attempt: attempt + 1,
        });
        return {
          ok: true,
          status: upstream.status,
          response: upstream,
          model,
          mode,
          stream: true,
        };
      }

      const raw = await upstream.text();
      if (upstream.ok) {
        const contentType = upstream.headers.get('content-type')?.toLowerCase() ?? '';
        if (looksLikeHtmlPayload(raw, contentType)) {
          return {
            ok: false,
            status: 502,
            message: parseOpenAIError(raw, contentType),
            model,
            mode,
          };
        }

        let data;
        try {
          data = JSON.parse(raw);
        } catch {
          if (attempt === 0) {
            writeTrace('upstream.attempt.retry_non_json', traceId, {
              model,
              mode,
              attempt: attempt + 1,
              contentType: contentType.slice(0, 120),
            });
            continue;
          }
          return {
            ok: false,
            status: 502,
            message: 'El proveedor de IA devolvio una respuesta no JSON.',
            model,
            mode,
          };
        }

        writeTrace('upstream.attempt.end', traceId, {
          model,
          status: upstream.status,
          mode,
          stream: false,
          durationMs: Date.now() - startedAt,
          attempt: attempt + 1,
        });
        return {
          ok: true,
          status: upstream.status,
          data,
          model,
          mode,
        };
      }

      const message = parseOpenAIError(raw, upstream.headers.get('content-type'));

      // Bailout: no reintentar si el modelo no existe (404 o 400 con model_not_found)
      if (upstream.status === 404 || (upstream.status === 400 && /model.*not.*found|does not exist/i.test(message))) {
        writeTrace('upstream.attempt.model_not_found', traceId, {
          model,
          status: upstream.status,
          durationMs: Date.now() - startedAt,
          attempt: attempt + 1,
        });
        return {
          ok: false,
          status: upstream.status,
          message,
          model,
          mode,
        };
      }

      if (includeTemperature && isTemperatureError(upstream.status, message)) {
        writeTrace('upstream.attempt.retry_without_temperature', traceId, {
          model,
          status: upstream.status,
          durationMs: Date.now() - startedAt,
          attempt: attempt + 1,
        });
        includeTemperature = false;
        continue;
      }

      if (upstream.status >= 500 && attempt === 0) {
        writeTrace('upstream.attempt.retry_transient_status', traceId, {
          model,
          status: upstream.status,
          mode,
          durationMs: Date.now() - startedAt,
          attempt: attempt + 1,
        });
        continue;
      }

      writeTrace('upstream.attempt.end', traceId, {
        model,
        status: upstream.status,
        mode,
        stream: false,
        durationMs: Date.now() - startedAt,
        attempt: attempt + 1,
        error: message.slice(0, 180),
      });
      return {
        ok: false,
        status: upstream.status,
        message,
        model,
        mode,
      };
    } catch (err) {
      if (err?.name === 'AbortError') {
        if (attempt === 0) {
          writeTrace('upstream.attempt.timeout_retrying', traceId, {
            model,
            mode,
            durationMs: Date.now() - startedAt,
            attempt: attempt + 1,
          });
          continue;
        }
        writeTrace('upstream.attempt.timeout', traceId, {
          model,
          mode,
          durationMs: Date.now() - startedAt,
          attempt: attempt + 1,
        });
        return {
          ok: false,
          status: 504,
          message: 'Timeout al contactar el endpoint de OpenAI.',
          model,
          mode,
        };
      }
      writeTrace('upstream.attempt.error', traceId, {
        model,
        mode,
        durationMs: Date.now() - startedAt,
        attempt: attempt + 1,
        error: String(err?.message || err).slice(0, 180),
      });
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    ok: false,
    status: 400,
    message: 'The configured AI endpoint rejected the request payload.',
    model,
  };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const expectedToken = process.env.OPENAI_PROXY_TOKEN || process.env.EXTENSION_TOKEN || '';
  if (expectedToken) {
    const clientToken = getHeader(req, 'x-extension-token') || getHeader(req, 'x-openai-proxy-token');
    if (!clientToken || clientToken !== expectedToken) {
      sendJson(res, 401, { error: 'Token de acceso invalido.' });
      return;
    }
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    sendJson(res, 500, { error: 'OPENAI_API_KEY no esta configurada en Vercel.' });
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { error: 'JSON invalido.' });
    return;
  }

  if (!body?.input || !body?.system) {
    sendJson(res, 400, { error: 'Faltan system o input.' });
    return;
  }
  const traceId = resolveTraceId(body, req);
  const withTrace = (payload) => ({ ...payload, traceId });
  res.setHeader(TRACE_HEADER, traceId);
  writeTrace('proxy.request.received', traceId, {
    model: String(body.model || ''),
    stream: body.stream === true,
    inputChars: String(body.input || '').length,
    systemChars: String(body.system || '').length,
  });

  let lastModelError = null;
  for (const model of buildModelAttempts(body.model)) {
    const result = await callOpenAI(apiKey, body, model, traceId);
    if (result.ok) {
      if (body.stream === true && result.stream === true && result.response) {
        try {
          await relayOpenAIStream(res, result.response, result.model, result.mode, traceId);
        } catch (err) {
          sendJson(res, 502, withTrace({
            error: `Error durante streaming: ${String(err?.message || err).slice(0, 320)}`,
          }));
        }
        return;
      }

      sendJson(res, 200, withTrace({
        text: extractOutputText(result.data).trim(),
        usage: getTokenUsage(result.data),
        model: result.model,
      }));
      return;
    }

    if (isModelError(result.status, result.message)) {
      lastModelError = result;
      continue;
    }

    if (result.status === 401) {
      sendJson(res, 401, withTrace({
        error: 'OPENAI_API_KEY no fue aceptada por el endpoint configurado. Si usas API enrutada, configura tambien OPENAI_BASE_URL u OPENAI_UPSTREAM_URL en Vercel.',
      }));
      return;
    }

    if (result.status === 429) {
      sendJson(res, 429, withTrace({ error: 'Rate limit de OpenAI alcanzado. Espera un momento.' }));
      return;
    }

    sendJson(res, result.status, withTrace({
      error: result.message.slice(0, 500),
      model: result.model,
    }));
    return;
  }

  sendJson(res, lastModelError?.status ?? 400, withTrace({
    error: 'Ninguno de los modelos configurados esta disponible para este endpoint.',
  }));
}
