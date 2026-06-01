import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('openai client falls back to the built-in Vercel proxy when a custom endpoint returns HTML', () => {
  const client = read('src/lib/openai-client.ts');

  assert.match(client, /DEFAULT_PROXY_URL\s*=\s*'\/api\/openai'/);
  assert.match(client, /sanitizeProxyEndpoint/);
  assert.match(client, /candidate\.startsWith\('\/api\/'\)/);
  assert.match(client, /storage\.setProxyUrl\(''\)/);
  assert.match(client, /looksLikeHtml/);
  assert.match(client, /retrying with the default proxy|fallback/i);
});

test('settings panel warns that the field expects a proxy endpoint, not the raw router base url', () => {
  const settings = read('src/components/SettingsPanel.tsx');

  assert.match(settings, /Endpoint del proxy/i);
  assert.match(settings, /Deja este campo vacio para usar el proxy seguro de Vercel/i);
  assert.match(settings, /Solo se admiten rutas \/api\/\.\.\./i);
});

test('index bootstrap clears legacy bare router urls before the app loads', () => {
  const html = read('index.html');

  assert.match(html, /lingo_proxy_url/);
  assert.match(html, /new URL\(proxyUrl, window\.location\.origin\)/);
  assert.match(html, /parsed\.origin === window\.location\.origin/);
  assert.match(html, /parsed\.pathname\.indexOf\('\/api\/'\) === 0/);
  assert.match(html, /localStorage\.removeItem\('lingo_proxy_url'\)/);
});
