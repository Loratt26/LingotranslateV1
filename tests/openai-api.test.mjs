import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  buildAuthHeaderValue,
  buildModelAttempts,
  buildUpstreamUrl,
  extractOutputText,
  getTokenUsage,
  looksLikeHtmlPayload,
  parseOpenAIError,
} from '../api/openai.js';

test('buildAuthHeaderValue supports bearer and raw router tokens', () => {
  assert.equal(buildAuthHeaderValue('abc', 'Bearer'), 'Bearer abc');
  assert.equal(buildAuthHeaderValue('abc', 'none'), 'abc');
  assert.equal(buildAuthHeaderValue('abc', 'raw'), 'abc');
});

test('extractOutputText reads direct output_text responses', () => {
  assert.equal(
    extractOutputText({ output_text: 'Hola mundo' }),
    'Hola mundo',
  );
});

test('extractOutputText reads nested Responses API message content', () => {
  const response = {
    output: [
      {
        type: 'message',
        content: [
          { type: 'output_text', text: 'Linea 1' },
          { type: 'output_text', text: '\nLinea 2' },
        ],
      },
    ],
  };

  assert.equal(extractOutputText(response), 'Linea 1\nLinea 2');
});

test('extractOutputText reads OpenAI-compatible chat completion content', () => {
  const response = {
    choices: [
      {
        message: {
          content: 'Respuesta desde router',
        },
      },
    ],
  };

  assert.equal(extractOutputText(response), 'Respuesta desde router');
});

test('getTokenUsage normalizes missing usage to zeroes', () => {
  assert.deepEqual(getTokenUsage({}), { inputTokens: 0, outputTokens: 0 });
  assert.deepEqual(
    getTokenUsage({ usage: { input_tokens: 12, output_tokens: 7 } }),
    { inputTokens: 12, outputTokens: 7 },
  );
  assert.deepEqual(
    getTokenUsage({ usage: { prompt_tokens: 13, completion_tokens: 8 } }),
    { inputTokens: 13, outputTokens: 8 },
  );
});

test('buildModelAttempts tries the selected model before fallbacks', () => {
  assert.deepEqual(
    buildModelAttempts('gpt-5.4-mini'),
    ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo'],
  );
});

test('buildModelAttempts skips the auto sentinel to avoid a wasted upstream hop', () => {
  assert.deepEqual(
    buildModelAttempts('auto'),
    ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo'],
  );
});

test('buildUpstreamUrl appends the responses path to router base urls', () => {
  assert.equal(
    buildUpstreamUrl('responses', undefined, 'https://router.example.com/v1'),
    'https://router.example.com/v1/responses',
  );
});

test('buildUpstreamUrl supports chat completions routers', () => {
  assert.equal(
    buildUpstreamUrl('chat_completions', undefined, 'https://router.example.com'),
    'https://router.example.com/v1/chat/completions',
  );
});

test('buildUpstreamUrl keeps exact upstream urls unchanged', () => {
  assert.equal(
    buildUpstreamUrl('responses', 'https://router.example.com/custom/generate', 'https://ignored.example.com'),
    'https://router.example.com/custom/generate',
  );
});

test('looksLikeHtmlPayload detects cloudflare-style html payloads even when wrapped in plain text', () => {
  const html = '<!DOCTYPE html><html class="no-js ie6 oldie"><head><title>Error</title></head><body>bad gateway</body></html>';
  assert.equal(looksLikeHtmlPayload(html, null), true);
  assert.equal(looksLikeHtmlPayload('mensaje normal', 'application/json'), false);
});

test('parseOpenAIError sanitizes html payloads instead of leaking markup', () => {
  const html = '<!DOCTYPE html><html><body>upstream error</body></html>';
  assert.equal(
    parseOpenAIError(html, 'text/html; charset=utf-8'),
    'El proveedor de IA devolvio una pagina HTML no valida.',
  );
  assert.equal(
    parseOpenAIError('{"error":{"message":"Rate limit"}}', 'application/json'),
    'Rate limit',
  );
});

test('proxy endpoint supports SSE streaming relay with delta and done events', () => {
  const source = readFileSync(new URL('../api/openai.js', import.meta.url), 'utf8');

  assert.match(source, /const stream = body\.stream === true/);
  assert.match(source, /relayOpenAIStream/);
  assert.match(source, /splitSSEEvents/);
  assert.match(source, /type:\s*'delta'/);
  assert.match(source, /type:\s*'done'/);
  assert.match(source, /if \(buffer\.trim\(\)\.length > 0\)/);
  assert.match(source, /text\/event-stream/);
  assert.match(source, /invalid_stream_content_type/);
});

test('proxy endpoint emits trace ids and structured logs for observability', () => {
  const source = readFileSync(new URL('../api/openai.js', import.meta.url), 'utf8');

  assert.match(source, /x-lingo-trace-id/);
  assert.match(source, /resolveTraceId/);
  assert.match(source, /writeTrace\(/);
  assert.match(source, /proxy\.request\.received/);
  assert.match(source, /timeout_retrying/);
});
