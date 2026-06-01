import test from 'node:test';
import assert from 'node:assert/strict';

import { generateOpenAIText, generateOpenAITextStream } from '../src/lib/openai-client.js';

function createLocalStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

function buildSSEStream(chunks) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

function withEnvironment(fn) {
  const previousFetch = globalThis.fetch;
  const previousWindow = globalThis.window;
  const previousLocalStorage = globalThis.localStorage;
  globalThis.window = { location: { origin: 'https://lingo.test' } };
  globalThis.localStorage = createLocalStorage({
    lingo_openai_model: 'gpt-5.4-nano',
    lingo_proxy_url: '',
  });

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      globalThis.fetch = previousFetch;
      globalThis.window = previousWindow;
      globalThis.localStorage = previousLocalStorage;
    });
}

test('generateOpenAITextStream parses chunked SSE data with CRLF and trailing buffer', async () => {
  await withEnvironment(async () => {
    const seenDeltas = [];
    globalThis.fetch = async () => new Response(
      buildSSEStream([
        'data: {"type":"delta","delta":"Ho"}\r\n\r\n',
        'data: {"type":"delta","delta":"la"}\r\n\r\n',
        'data: {"type":"done","text":"Hola","usage":{"inputTokens":7,"outputTokens":3},"model":"gpt-5.4-mini"}',
      ]),
      {
        status: 200,
        headers: { 'content-type': 'text/event-stream; charset=utf-8' },
      },
    );

    const result = await generateOpenAITextStream({
      system: 'Translate',
      input: 'Hola',
      maxOutputTokens: 64,
      onDelta: (delta) => seenDeltas.push(delta),
    }, '');

    assert.deepEqual(seenDeltas, ['Ho', 'la']);
    assert.equal(result.text, 'Hola');
    assert.equal(result.inputTokens, 7);
    assert.equal(result.outputTokens, 3);
    assert.equal(result.model, 'gpt-5.4-mini');
  });
});

test('generateOpenAITextStream accepts done-only payloads without delta events', async () => {
  await withEnvironment(async () => {
    globalThis.fetch = async () => new Response(
      buildSSEStream([
        'data: {"type":"done","text":"Texto final","usage":{"inputTokens":5,"outputTokens":2},"model":"gpt-5.4-nano"}\n\n',
        'data: [DONE]\n\n',
      ]),
      {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      },
    );

    const result = await generateOpenAITextStream({
      system: 'Translate',
      input: 'Texto',
      maxOutputTokens: 64,
      onDelta: () => {},
    }, '');

    assert.equal(result.text, 'Texto final');
    assert.equal(result.inputTokens, 5);
    assert.equal(result.outputTokens, 2);
  });
});

test('generateOpenAITextStream forwards traceId to the proxy payload', async () => {
  await withEnvironment(async () => {
    let capturedBody = null;
    globalThis.fetch = async (_url, init) => {
      capturedBody = JSON.parse(String(init?.body ?? '{}'));
      return new Response(
        buildSSEStream(['data: {"type":"done","text":"ok","usage":{"inputTokens":1,"outputTokens":1}}\n\n']),
        {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        },
      );
    };

    await generateOpenAITextStream({
      traceId: 'trace-demo-123',
      system: 'Translate',
      input: 'Hola',
      maxOutputTokens: 32,
      onDelta: () => {},
    }, '');

    assert.equal(capturedBody.traceId, 'trace-demo-123');
  });
});

test('generateOpenAIText sanitizes html markup wrapped inside proxy json errors', async () => {
  await withEnvironment(async () => {
    globalThis.fetch = async () => new Response(
      JSON.stringify({
        error: '<!DOCTYPE html><html class="no-js ie6 oldie"><body>upstream down</body></html>',
      }),
      {
        status: 502,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      },
    );

    await assert.rejects(
      () => generateOpenAIText({
        system: 'Translate',
        input: 'Hola',
        maxOutputTokens: 64,
      }, ''),
      (err) => {
        assert.match(String(err?.message ?? ''), /pagina HTML/i);
        assert.doesNotMatch(String(err?.message ?? ''), /<!doctype html|<html\b/i);
        return true;
      },
    );
  });
});

test('generateOpenAITextStream sanitizes html markup wrapped inside proxy json errors', async () => {
  await withEnvironment(async () => {
    globalThis.fetch = async () => new Response(
      JSON.stringify({
        error: '<!DOCTYPE html><html class="no-js ie6 oldie"><body>upstream down</body></html>',
      }),
      {
        status: 502,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      },
    );

    await assert.rejects(
      () => generateOpenAITextStream({
        system: 'Translate',
        input: 'Hola',
        maxOutputTokens: 64,
        onDelta: () => {},
      }, ''),
      (err) => {
        assert.match(String(err?.message ?? ''), /pagina HTML/i);
        assert.doesNotMatch(String(err?.message ?? ''), /<!doctype html|<html\b/i);
        return true;
      },
    );
  });
});
