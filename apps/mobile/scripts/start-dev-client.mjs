#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(process.cwd());
const rawArgs = process.argv.slice(2);

function logDiagnostic(message, details) {
  if (details === undefined) {
    console.log(`ℹ️  [start:dev-client] ${message}`);
    return;
  }

  console.log(`ℹ️  [start:dev-client] ${message}:`, details);
}

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

function readBundleIdentifiers() {
  const appJsonPath = path.join(projectRoot, 'app.json');

  if (!existsSync(appJsonPath)) {
    return [];
  }

  const appJson = JSON.parse(readFileSync(appJsonPath, 'utf8'));
  const explicitBundleId = appJson?.expo?.ios?.bundleIdentifier;
  if (typeof explicitBundleId === 'string' && explicitBundleId.length > 0) {
    return [explicitBundleId];
  }

  const slug = appJson?.expo?.slug;
  if (typeof slug === 'string' && slug.length > 0) {
    return [`com.anonymous.${slug}`];
  }

  return [];
}

function hasBootedIosSimulator() {
  try {
    const output = execSync('xcrun simctl list devices booted --json', {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe']
    }).toString();
    const parsed = JSON.parse(output);
    const devices = Object.values(parsed.devices ?? {}).flat();
    logDiagnostic('Booted iOS simulators detected', devices.map((device) => device.name ?? device.udid ?? 'unknown'));
    return devices.length > 0;
  } catch (error) {
    logDiagnostic('Failed to inspect booted iOS simulators', error instanceof Error ? error.message : String(error));
    return false;
  }
}

function isInstalledOnBootedSimulator(bundleIdentifiers) {
  if (bundleIdentifiers.length === 0) {
    return true;
  }

  try {
    const output = execSync('xcrun simctl listapps booted --json', {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe']
    }).toString();
    const parsed = JSON.parse(output);
    const installedBundleIds = new Set(Object.keys(parsed?.apps ?? {}));
    logDiagnostic('Installed app bundle identifiers on booted simulator', [...installedBundleIds]);
    return bundleIdentifiers.some((bundleId) => installedBundleIds.has(bundleId));
  } catch (error) {
    logDiagnostic('Failed to inspect installed iOS simulator apps', error instanceof Error ? error.message : String(error));
    return false;
  }
}

function printRunFailure(error, command, description) {
  const status = error && typeof error === 'object' && 'status' in error
    ? Number(error.status) || 1
    : 1;
  const signal = error && typeof error === 'object' && 'signal' in error
    ? error.signal
    : null;
  const message = error instanceof Error ? error.message : String(error);

  console.error(`❌ [start:dev-client] ${description ?? 'command'} failed.`);
  console.error(`   ↳ command: ${command}`);
  console.error(`   ↳ cwd: ${projectRoot}`);
  console.error(`   ↳ exit status: ${status}`);
  if (signal) {
    console.error(`   ↳ signal: ${signal}`);
  }
  console.error(`   ↳ message: ${message}`);

  return { status, signal, message };
}

function run(command, description, options = {}) {
  const { exitOnError = true } = options;
  logDiagnostic(`Running ${description ?? 'command'}`, command);

  try {
    execSync(command, { stdio: 'inherit', cwd: projectRoot });
    logDiagnostic(`Completed ${description ?? 'command'}`);
    return { ok: true, status: 0 };
  } catch (error) {
    const failure = printRunFailure(error, command, description);

    if (!exitOnError) {
      return { ok: false, ...failure };
    }

    process.exit(failure.status || 1);
  }
}

function runIosBuildWithDiagnostics() {
  const baseCommand = 'npx expo run:ios --no-bundler';
  const baseAttempt = run(baseCommand, 'Expo iOS simulator build/install', { exitOnError: false });

  if (baseAttempt.ok) {
    return;
  }

  if (baseAttempt.status === 65) {
    console.error('');
    console.error('🧭 xcodebuild exited with code 65 (generic iOS build failure).');
    console.error('   Automatically retrying with verbose native logs to surface a root cause...');
    const verboseCommand = 'npx expo run:ios --no-bundler --verbose';
    const verboseAttempt = run(verboseCommand, 'Expo iOS simulator build/install (verbose retry)', { exitOnError: false });

    if (verboseAttempt.ok) {
      return;
    }

    console.error('');
    console.error('   Suggested follow-up steps:');
    console.error('   1) Ensure Pods are fresh after dependency updates:');
    console.error('      npm run ios:prebuild -w @dominion/mobile');
    console.error('      cd apps/mobile/ios && pod install --repo-update');
    console.error('   2) Open ios/*.xcworkspace in Xcode and build once to inspect signing/runtime errors.');
    console.error('   3) If this began after an SDK/RN upgrade, delete apps/mobile/ios and prebuild again.');

    process.exit(verboseAttempt.status || 1);
  }

  process.exit(baseAttempt.status || 1);
}

const iosSimulator = readFlag('iosSimulator');
const androidSimulator = readFlag('androidSimulator');

logDiagnostic('Execution context', {
  cwd: projectRoot,
  node: process.version,
  platform: process.platform,
  rawArgs
});
logDiagnostic('Resolved platform flags', { iosSimulator, androidSimulator });

if (iosSimulator && androidSimulator) {
  console.error('❌ Choose only one platform bootstrap flag: --iosSimulator or --androidSimulator');
  process.exit(1);
}

run('node ./scripts/check-mobile-deps.mjs', 'mobile dependency check');

const bundleIdentifiers = readBundleIdentifiers();
logDiagnostic('Resolved iOS bundle identifiers', bundleIdentifiers);

if (!iosSimulator && !androidSimulator && process.platform === 'darwin' && hasBootedIosSimulator() && !isInstalledOnBootedSimulator(bundleIdentifiers)) {
  const expectedBundle = bundleIdentifiers[0] ?? 'your iOS bundle identifier';
  console.error(`\n❌ No iOS development build is installed for ${expectedBundle}.`);
  console.error('   Build/install it once with: npm run start:dev-client -w @dominion/mobile -- --iosSimulator');
  process.exit(1);
}

if (iosSimulator) {
  console.log('\n🔧 Preparing iOS development client (simulator build + install)...');
  // Run the toolchain check directly so failures are reported once from this command.
  run('node ./scripts/check-ios-toolchain.mjs', 'iOS toolchain check');
  run('CI=1 npx expo prebuild --platform ios --clean', 'Expo iOS prebuild');
  runIosBuildWithDiagnostics();
}

if (androidSimulator) {
  console.log('\n🔧 Preparing Android development client (emulator build + install)...');
  run('npx expo run:android --no-bundler', 'Expo Android emulator build/install');
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

logDiagnostic('Final Expo CLI arguments', passthroughArgs);

console.log('\n🚀 Launching Expo Metro in dev-client mode...');
run(startCommand, 'Expo Metro dev-client start');
