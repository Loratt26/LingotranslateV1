interface Env {
  OPENAI_API_KEY: string;
  EXTENSION_TOKEN: string;
  OPENAI_DEFAULT_MODEL?: string;
}

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_MODEL = 'gpt-4o-mini';

const MODEL_ID_MAP: Record<string, string> = {
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
  'glm-5':            'gpt-4o',
  'auto':              'gpt-4o-mini',
};

function resolveModelId(uiId: string): string {
  if (!uiId) return '';
  const key = uiId.trim().toLowerCase();
  return MODEL_ID_MAP[key] || uiId;
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Extension-Token',
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== 'POST') {
      return errorResponse(405, 'Method not allowed');
    }

    const clientToken = request.headers.get('X-Extension-Token');
    if (!clientToken || clientToken !== env.EXTENSION_TOKEN) {
      return errorResponse(401, 'Unauthorized');
    }

    let body: {
      model?: string;
      system?: string;
      input?: string;
      maxOutputTokens?: number;
      temperature?: number;
    };
    try {
      body = await request.json();
    } catch {
      return errorResponse(400, 'Invalid JSON body');
    }

    const upstreamBody: Record<string, unknown> = {
      model: resolveModelId(body.model || env.OPENAI_DEFAULT_MODEL || DEFAULT_MODEL),
      instructions: String(body.system ?? ''),
      input: String(body.input ?? ''),
      max_output_tokens: clampNumber(body.maxOutputTokens, 1024, 1, 4096),
      store: false,
    };

    if (body.temperature !== undefined) {
      upstreamBody.temperature = clampNumber(body.temperature, 0, 0, 2);
    }

    const upstream = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(upstreamBody),
    });

    const data = await upstream.json() as Record<string, unknown>;
    if (!upstream.ok) {
      return errorResponse(upstream.status, extractErrorMessage(data));
    }

    return jsonResponse(200, {
      text: extractOutputText(data).trim(),
      usage: getTokenUsage(data),
      model: upstreamBody.model,
    });
  },
};

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function extractOutputText(data: Record<string, unknown>): string {
  if (typeof data.output_text === 'string') return data.output_text;
  const output = Array.isArray(data.output) ? data.output : [];

  return output.flatMap((item) => {
    const content = typeof item === 'object' && item !== null && 'content' in item
      ? (item as { content?: unknown }).content
      : [];
    return Array.isArray(content)
      ? content.map((part) => typeof part === 'object' && part !== null && 'text' in part
        ? String((part as { text?: unknown }).text ?? '')
        : '')
      : [];
  }).join('');
}

function getTokenUsage(data: Record<string, unknown>): { inputTokens: number; outputTokens: number } {
  const usage = typeof data.usage === 'object' && data.usage !== null
    ? data.usage as { input_tokens?: unknown; output_tokens?: unknown }
    : {};
  return {
    inputTokens: Number(usage.input_tokens ?? 0),
    outputTokens: Number(usage.output_tokens ?? 0),
  };
}

function extractErrorMessage(data: Record<string, unknown>): string {
  const error = data.error;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message?: unknown }).message ?? 'OpenAI error');
  }
  return 'OpenAI error';
}

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function errorResponse(status: number, message: string): Response {
  return jsonResponse(status, { error: message });
}
