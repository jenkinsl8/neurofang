import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { collectProxyWarnings, ensureEnvironmentFiles, parseMajor, sanitizeProxyEnv } from './build-doctor.mjs';

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

test('ensureEnvironmentFiles copies missing env files from templates in fix mode', () => {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'build-doctor-'));
  const serverDir = path.join(rootDir, 'apps/server');
  const webDir = path.join(rootDir, 'apps/web');
  const mobileDir = path.join(rootDir, 'apps/mobile');

  [serverDir, webDir, mobileDir].forEach((dir) => {
    mkdirSync(dir, { recursive: true });
  });

  writeFileSync(path.join(serverDir, '.env.example'), 'SERVER_KEY=demo\n');
  writeFileSync(path.join(webDir, '.env.local.example'), 'NEXT_PUBLIC_SERVER=http://localhost:4000\n');
  writeFileSync(path.join(mobileDir, '.env.example'), 'EXPO_PUBLIC_SERVER=http://localhost:4000\n');

  const result = ensureEnvironmentFiles({ fix: true, rootDir });
  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
});
