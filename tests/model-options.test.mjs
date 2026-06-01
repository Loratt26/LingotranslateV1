import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/lib/model-options.ts', import.meta.url), 'utf8');

function modelIds() {
  return [...source.matchAll(/id:\s*'([^']+)'/g)].map((match) => match[1]);
}

test('model selector includes every routed model id in speed-first order', () => {
  assert.deepEqual(modelIds(), [
    'auto',
    'gpt-5.4-mini',
    'claude-haiku-4.5',
    'minimax-m2.1',
    'minimax-m2.5',
    'gpt-5.4',
    'claude-sonnet-4',
    'claude-sonnet-4.5',
    'claude-sonnet-4.6',
    'gpt-5.5',
    'gpt-5.2',
    'gpt-5.2-codex',
    'gpt-5.3-codex',
    'claude-opus-4.5',
    'claude-opus-4.6',
    'claude-opus-4.7',
    'deepseek-3.2',
    'qwen3-coder-next',
    'glm-5',
  ]);
});

test('auto is the default router model', () => {
  assert.match(source, /DEFAULT_OPENAI_MODEL = 'gpt-5\.4-mini'/);
});
