#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(process.cwd());
const rawArgs = process.argv.slice(2);

const argAliases = {
  iosSimulator: ['--iosSimulator', '--ios-simulator', '--ios'],
  androidSimulator: ['--androidSimulator', '--android-simulator', '--android']
};

function readFlag(name) {
  const aliases = argAliases[name];

  for (let i = 0; i < rawArgs.length; i += 1) {
    const arg = rawArgs[i];
    if (!aliases.includes(arg)) {
      continue;
    }

    const next = rawArgs[i + 1];
    if (next === 'false') {
      return false;
    }

    return true;
  }

  return false;
}

function stripControlFlags(args) {
  const controls = new Set([...argAliases.iosSimulator, ...argAliases.androidSimulator]);
  const filtered = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!controls.has(arg)) {
      filtered.push(arg);
      continue;
    }

    const next = args[i + 1];
    if (next === 'true' || next === 'false') {
      i += 1;
    }
  }

  return filtered;
}

function readExpoScheme() {
  const appJsonPath = path.join(projectRoot, 'app.json');

  if (!existsSync(appJsonPath)) {
    return null;
  }

  const appJson = JSON.parse(readFileSync(appJsonPath, 'utf8'));
  return appJson?.expo?.scheme ?? null;
}

function run(command) {
  try {
    execSync(command, { stdio: 'inherit', cwd: projectRoot });
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) {
      process.exit(Number(error.status) || 1);
    }

    process.exit(1);
  }
}

const iosSimulator = readFlag('iosSimulator');
const androidSimulator = readFlag('androidSimulator');

if (iosSimulator && androidSimulator) {
  console.error('❌ Choose only one platform bootstrap flag: --iosSimulator or --androidSimulator');
  process.exit(1);
}

run('node ./scripts/check-mobile-deps.mjs');

if (iosSimulator) {
  console.log('\n🔧 Preparing iOS development client (simulator build + install)...');
  run('npm run ios:check');
  run('npm run prebuild:ios');
  run('npx expo run:ios --no-bundler');
}

if (androidSimulator) {
  console.log('\n🔧 Preparing Android development client (emulator build + install)...');
  run('npx expo run:android --no-bundler');
}

const passthroughArgs = stripControlFlags(rawArgs);

if (iosSimulator && !passthroughArgs.includes('--ios')) {
  passthroughArgs.push('--ios');
}

if (androidSimulator && !passthroughArgs.includes('--android')) {
  passthroughArgs.push('--android');
}

const scheme = readExpoScheme();
if (scheme && (iosSimulator || androidSimulator) && !passthroughArgs.includes('--scheme')) {
  passthroughArgs.push('--scheme', scheme);
}

const expoArgs = passthroughArgs.join(' ');
const startCommand = expoArgs.length > 0
  ? `npx expo start --dev-client --host lan ${expoArgs}`
  : 'npx expo start --dev-client --host lan';

console.log('\n🚀 Launching Expo Metro in dev-client mode...');
run(startCommand);
