# Routed AI API Integration Guide

Use this guide when adding the routed AI API to another app. The router used by Lingo is OpenAI-compatible, but it must be called through the router base URL, not directly through `https://api.openai.com`.

## Known Working Configuration

Production router base URL:

```text
https://api.trannhatcse.tokyo
```

Use the routed token as the server-side API key:

```text
OPENAI_API_KEY=<rtk_live_...>
```

Do not expose this token in frontend code, localStorage, browser requests, screenshots, logs, or public repos.

## Recommended Environment Variables

For Vercel, Netlify functions, Cloudflare Workers, Next.js API routes, Express, or any server-side adapter:

```bash
OPENAI_API_KEY=<rtk_live_...>
OPENAI_BASE_URL=https://api.trannhatcse.tokyo
OPENAI_UPSTREAM_MODE=responses
OPENAI_DEFAULT_MODEL=auto
```

Optional compatibility variables:

```bash
# Use this only if the router expects a non-Bearer auth header.
OPENAI_AUTH_HEADER=Authorization
OPENAI_AUTH_SCHEME=Bearer

# Alternative examples:
# OPENAI_AUTH_HEADER=x-api-key
# OPENAI_AUTH_SCHEME=none

# Use this when the router gives you an exact endpoint instead of a base URL.
# OPENAI_UPSTREAM_URL=https://api.trannhatcse.tokyo/v1/responses
```

## Endpoint Construction

If `OPENAI_UPSTREAM_MODE=responses`, send requests to:

```text
${OPENAI_BASE_URL}/v1/responses
```

If `OPENAI_UPSTREAM_MODE=chat_completions`, send requests to:

```text
${OPENAI_BASE_URL}/v1/chat/completions
```

The Lingo production integration currently works with:

```text
https://api.trannhatcse.tokyo/v1/responses
```

## Request Contract: Responses Mode

Use this payload when the router supports Responses API format:

```json
{
  "model": "auto",
  "instructions": "You are a precise translation engine. Output only the translation.",
  "input": "Translate this text to English: Hola mundo",
  "max_output_tokens": 1024,
  "temperature": 0,
  "store": false
}
```

Headers:

```http
Authorization: Bearer <rtk_live_...>
Content-Type: application/json
```

Expected response shapes may include either:

```json
{
  "output_text": "Hello world",
  "usage": {
    "input_tokens": 20,
    "output_tokens": 3
  }
}
```

or:

```json
{
  "output": [
    {
      "type": "message",
      "content": [
        {
          "type": "output_text",
          "text": "Hello world"
        }
      ]
    }
  ],
  "usage": {
    "input_tokens": 20,
    "output_tokens": 3
  }
}
```

## Request Contract: Chat Completions Mode

Use this only if the router project says it does not support `/v1/responses`.

```json
{
  "model": "auto",
  "messages": [
    {
      "role": "system",
      "content": "You are a precise translation engine. Output only the translation."
    },
    {
      "role": "user",
      "content": "Translate this text to English: Hola mundo"
    }
  ],
  "max_tokens": 1024,
  "temperature": 0
}
```

Expected response:

```json
{
  "choices": [
    {
      "message": {
        "content": "Hello world"
      }
    }
  ],
  "usage": {
    "prompt_tokens": 20,
    "completion_tokens": 3
  }
}
```

## Model IDs Verified With This Router

These model IDs responded successfully through the router in Lingo production health checks:

```text
auto
gpt-5.5
gpt-5.4
gpt-5.4-mini
gpt-5.3-codex
gpt-5.2-codex
gpt-5.2
claude-opus-4.7
claude-opus-4.6
claude-opus-4.5
claude-sonnet-4.6
claude-sonnet-4.5
claude-sonnet-4
claude-haiku-4.5
deepseek-3.2
qwen3-coder-next
glm-5
minimax-m2.5
minimax-m2.1
```

Recommended order for translation UX:

```text
auto
gpt-5.4-mini
claude-haiku-4.5
minimax-m2.1
minimax-m2.5
gpt-5.4
claude-sonnet-4
claude-sonnet-4.5
claude-sonnet-4.6
gpt-5.5
gpt-5.2
gpt-5.2-codex
gpt-5.3-codex
claude-opus-4.5
claude-opus-4.6
claude-opus-4.7
deepseek-3.2
qwen3-coder-next
glm-5
```

Practical defaults:

- `auto`: best default if the router has smart routing.
- `gpt-5.4-mini`: fast and accurate for translation.
- `claude-haiku-4.5`: very fast.
- `minimax-m2.1` or `minimax-m2.5`: fast alternatives.
- `gpt-5.5` and `claude-opus-*`: reserve for max quality, likely slower.

## Server-Side Proxy Pattern

Frontend apps should call your own backend, for example `/api/openai`, not the routed API directly. The backend should:

1. Read `OPENAI_API_KEY` from server environment variables.
2. Read `OPENAI_BASE_URL` from server environment variables.
3. Convert your app's internal request into `responses` or `chat_completions` format.
4. Forward the request with the routed token.
5. Normalize the response into a small app contract.

Recommended app-facing contract:

```json
{
  "model": "auto",
  "system": "System prompt here",
  "input": "User prompt here",
  "maxOutputTokens": 1024,
  "temperature": 0
}
```

Recommended app-facing response:

```json
{
  "text": "Model output",
  "usage": {
    "inputTokens": 123,
    "outputTokens": 45
  },
  "model": "auto"
}
```

## Minimal Vercel Function

Create `api/openai.js`:

```js
const BASE_URL = (process.env.OPENAI_BASE_URL || 'https://api.openai.com').replace(/\/+$/, '');
const MODE = process.env.OPENAI_UPSTREAM_MODE || 'responses';

function endpointUrl() {
  if (MODE === 'chat_completions') return `${BASE_URL}/v1/chat/completions`;
  return `${BASE_URL}/v1/responses`;
}

function payloadFor(body) {
  if (MODE === 'chat_completions') {
    return {
      model: body.model || process.env.OPENAI_DEFAULT_MODEL || 'auto',
      messages: [
        { role: 'system', content: String(body.system || '') },
        { role: 'user', content: String(body.input || '') }
      ],
      max_tokens: Number(body.maxOutputTokens || 1024),
      temperature: Number(body.temperature || 0)
    };
  }

  return {
    model: body.model || process.env.OPENAI_DEFAULT_MODEL || 'auto',
    instructions: String(body.system || ''),
    input: String(body.input || ''),
    max_output_tokens: Number(body.maxOutputTokens || 1024),
    temperature: Number(body.temperature || 0),
    store: false
  };
}

function outputText(data) {
  if (typeof data.output_text === 'string') return data.output_text;
  const output = Array.isArray(data.output) ? data.output : [];
  const nested = output.flatMap((item) => item.content || [])
    .map((part) => part.text || '')
    .join('');
  if (nested) return nested;
  return (data.choices || []).map((choice) => choice.message?.content || choice.text || '').join('');
}

function usage(data) {
  return {
    inputTokens: Number(data.usage?.input_tokens || data.usage?.prompt_tokens || 0),
    outputTokens: Number(data.usage?.output_tokens || data.usage?.completion_tokens || 0)
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    res.status(500).json({ error: 'OPENAI_API_KEY is not configured' });
    return;
  }

  const upstream = await fetch(endpointUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payloadFor(req.body || {}))
  });

  const raw = await upstream.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    res.status(502).json({ error: raw.slice(0, 500) });
    return;
  }

  if (!upstream.ok) {
    res.status(upstream.status).json({
      error: data.error?.message || raw.slice(0, 500)
    });
    return;
  }

  res.status(200).json({
    text: outputText(data).trim(),
    usage: usage(data),
    model: req.body?.model || process.env.OPENAI_DEFAULT_MODEL || 'auto'
  });
}
```

## Health Check

After deploying, test the server route, not the router directly:

```bash
curl -X POST https://your-app.vercel.app/api/openai \
  -H "Content-Type: application/json" \
  -d '{
    "model": "auto",
    "system": "Reply OK only.",
    "input": "health",
    "maxOutputTokens": 3,
    "temperature": 0
  }'
```

Expected:

```json
{
  "text": "OK",
  "usage": {
    "inputTokens": 0,
    "outputTokens": 0
  },
  "model": "auto"
}
```

Token counts may differ by model/router. The important part is a 200 response and non-empty `text`.

## Troubleshooting

- `401`: token is wrong, expired, missing, or sent to the wrong base URL.
- `404`: wrong endpoint path; try `OPENAI_UPSTREAM_MODE=chat_completions` or set `OPENAI_UPSTREAM_URL` exactly.
- `400` mentioning `temperature`: omit `temperature` for that model or provider.
- Model not found: use `auto` first, then test exact model IDs one at a time.
- CORS errors: frontend is calling the router directly. Route through your backend.
- Slow responses: use `auto`, `gpt-5.4-mini`, `claude-haiku-4.5`, `minimax-m2.1`, or `minimax-m2.5`.

