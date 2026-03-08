import test from 'node:test';
import assert from 'node:assert/strict';
import { collectProxyWarnings, parseMajor, sanitizeProxyEnv } from './build-doctor.mjs';

test('parseMajor reads version strings with or without v-prefix', () => {
  assert.equal(parseMajor('v20.11.1'), 20);
  assert.equal(parseMajor('11.4.2'), 11);
});

test('collectProxyWarnings returns only placeholder proxy entries', () => {
  const warnings = collectProxyWarnings({
    HTTP_PROXY: 'http://proxy:8080',
    HTTPS_PROXY: 'http://corp.proxy.local:3128'
  });

  assert.deepEqual(warnings, ['HTTP_PROXY=http://proxy:8080']);
});

test('sanitizeProxyEnv removes placeholder proxy vars but keeps custom values', () => {
  const nextEnv = sanitizeProxyEnv({
    HTTP_PROXY: 'http://proxy:8080',
    HTTPS_PROXY: 'http://corp.proxy.local:3128',
    npm_config_http_proxy: 'http://proxy:8080'
  });

  assert.equal(nextEnv.HTTP_PROXY, undefined);
  assert.equal(nextEnv.npm_config_http_proxy, undefined);
  assert.equal(nextEnv.HTTPS_PROXY, 'http://corp.proxy.local:3128');
});
