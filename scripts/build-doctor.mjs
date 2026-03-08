import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const REQUIRED_NODE_MAJOR = 20;
const REQUIRED_NPM_MAJOR = 10;
const PLACEHOLDER_PROXY_SNIPPET = 'proxy:8080';
const INSTALL_TIMEOUT_MS = 120000;

export function parseMajor(versionText) {
  const match = versionText.trim().match(/v?(\d+)/);
  return match ? Number.parseInt(match[1], 10) : Number.NaN;
}

function readCommandOutput(cmd, args) {
  const result = spawnSync(cmd, args, { encoding: 'utf-8' });
  if (result.status !== 0) {
    return null;
  }

  return result.stdout.trim();
}

export function sanitizeProxyEnv(baseEnv) {
  const nextEnv = { ...baseEnv };
  const proxyKeys = [
    'http_proxy',
    'https_proxy',
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'npm_config_http_proxy',
    'npm_config_https_proxy'
  ];

  for (const key of proxyKeys) {
    const value = nextEnv[key];
    if (typeof value === 'string' && value.includes(PLACEHOLDER_PROXY_SNIPPET)) {
      delete nextEnv[key];
    }
  }

  return nextEnv;
}

export function collectProxyWarnings(env) {
  const warnings = [];
  const keys = [
    'http_proxy',
    'https_proxy',
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'npm_config_http_proxy',
    'npm_config_https_proxy'
  ];

  for (const key of keys) {
    const value = env[key];
    if (typeof value === 'string' && value.includes(PLACEHOLDER_PROXY_SNIPPET)) {
      warnings.push(`${key}=${value}`);
    }
  }

  return warnings;
}

export function ensureDependenciesInstalled({ fix, rootDir }) {
  if (existsSync(path.join(rootDir, 'node_modules'))) {
    return { ok: true, changed: false };
  }

  if (!fix) {
    return {
      ok: false,
      changed: false,
      message: 'Dependencies are missing. Run `npm install` or rerun this command with --fix.'
    };
  }

  const installEnv = sanitizeProxyEnv(process.env);
  const result = spawnSync('npm', ['install'], {
    cwd: rootDir,
    encoding: 'utf-8',
    env: installEnv,
    stdio: 'inherit',
    timeout: INSTALL_TIMEOUT_MS
  });

  if (result.error?.code === 'ETIMEDOUT') {
    return {
      ok: false,
      changed: false,
      message:
        'Automatic dependency installation timed out. Check npm registry/proxy access and rerun `npm run deploy:check`.'
    };
  }

  if (result.status !== 0) {
    return {
      ok: false,
      changed: false,
      message:
        'Automatic dependency installation failed. Verify registry/proxy access and rerun `npm run deploy:check`.'
    };
  }

  return { ok: true, changed: true };
}

export function main() {
  const args = new Set(process.argv.slice(2));
  const fix = args.has('--fix');
  const rootDir = process.cwd();

  const failures = [];
  const notes = [];

  const nodeMajor = parseMajor(process.version);
  if (!Number.isFinite(nodeMajor) || nodeMajor < REQUIRED_NODE_MAJOR) {
    failures.push(`Node.js ${REQUIRED_NODE_MAJOR}+ is required (current: ${process.version}).`);
  }

  const npmVersion = readCommandOutput('npm', ['--version']);
  const npmMajor = npmVersion ? parseMajor(npmVersion) : Number.NaN;
  if (!Number.isFinite(npmMajor) || npmMajor < REQUIRED_NPM_MAJOR) {
    failures.push(`npm ${REQUIRED_NPM_MAJOR}+ is required (current: ${npmVersion ?? 'unknown'}).`);
  }

  const registry = readCommandOutput('npm', ['config', 'get', 'registry']) ?? 'unknown';
  notes.push(`Detected npm registry: ${registry}`);

  const proxyWarnings = collectProxyWarnings(process.env);
  if (proxyWarnings.length > 0) {
    notes.push(
      'Detected placeholder proxy values that commonly break npm installs. These values are ignored for auto-install attempts:\n' +
        proxyWarnings.map((entry) => `  - ${entry}`).join('\n')
    );
  }

  const dependencies = ensureDependenciesInstalled({ fix, rootDir });
  if (!dependencies.ok && dependencies.message) {
    failures.push(dependencies.message);
  }

  if (dependencies.changed) {
    notes.push('Installed workspace dependencies automatically (node_modules was missing).');
  }

  if (notes.length > 0) {
    console.log('[build-doctor] Environment analysis summary:');
    for (const note of notes) {
      console.log(`- ${note}`);
    }
  }

  if (failures.length > 0) {
    console.error('[build-doctor] Blocking issues found:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log('[build-doctor] Environment checks passed.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main();
}
