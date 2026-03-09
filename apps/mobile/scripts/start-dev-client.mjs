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
  iosSimulator: ['--iosSimulator', '--ios-simulator'],
  androidSimulator: ['--androidSimulator', '--android-simulator'],
  cleanPrebuild: ['--cleanPrebuild', '--clean-prebuild']
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
  const controls = new Set([
    ...argAliases.iosSimulator,
    ...argAliases.androidSimulator,
    ...argAliases.cleanPrebuild
  ]);
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

function hasExpoHostArg(args) {
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--host' || arg.startsWith('--host=')) {
      return true;
    }
  }

  return false;
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


function resolveIosSimulatorUdid() {
  try {
    const output = execSync('xcrun simctl list devices --json', {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe']
    }).toString();
    const parsed = JSON.parse(output);
    const devices = Object.values(parsed.devices ?? {}).flat();
    const iosDevices = devices.filter((device) => {
      const runtime = String(device.runtime ?? '');
      const isIosRuntime = runtime.includes('iOS') || runtime.includes('com.apple.CoreSimulator.SimRuntime.iOS');
      return device.isAvailable !== false && isIosRuntime;
    });

    const booted = iosDevices.find((device) => device.state === 'Booted');
    if (booted?.udid) {
      return booted.udid;
    }

    const firstAvailable = iosDevices.find((device) => typeof device.udid === 'string');
    return firstAvailable?.udid ?? null;
  } catch (error) {
    logDiagnostic('Failed to resolve iOS simulator device list', error instanceof Error ? error.message : String(error));
    return null;
  }
}

function ensureBootedSimulator(udid) {
  if (!udid) {
    return false;
  }

  try {
    execSync(`xcrun simctl boot ${udid}`, {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    logDiagnostic('Booted iOS simulator', udid);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('Unable to boot device in current state: Booted')) {
      logDiagnostic('iOS simulator already booted', udid);
      return true;
    }

    logDiagnostic('Failed to boot iOS simulator', message);
    return false;
  }
}

function isInstalledOnSimulator(udid, bundleIdentifiers) {
  if (!udid || bundleIdentifiers.length === 0) {
    return true;
  }

  try {
    const output = execSync(`xcrun simctl listapps ${udid} --json`, {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe']
    }).toString();
    const parsed = JSON.parse(output);
    const installedBundleIds = new Set(Object.keys(parsed?.apps ?? {}));
    logDiagnostic('Installed app bundle identifiers on target iOS simulator', [...installedBundleIds]);
    return bundleIdentifiers.some((bundleId) => installedBundleIds.has(bundleId));
  } catch (error) {
    logDiagnostic('Failed to inspect installed apps on target iOS simulator', error instanceof Error ? error.message : String(error));
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
  const { exitOnError = true, env = {} } = options;
  logDiagnostic(`Running ${description ?? 'command'}`, command);

  try {
    execSync(command, { stdio: 'inherit', cwd: projectRoot, env: { ...process.env, ...env } });
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
  const baseAttempt = run(baseCommand, 'Expo iOS simulator build/install', { exitOnError: false, env: { EXPO_DEBUG: '1' } });

  if (baseAttempt.ok) {
    return;
  }

  if (baseAttempt.status === 65) {
    console.error('');
    console.error('🧭 xcodebuild exited with code 65 (generic iOS build failure).');
    console.error('   Running iOS self-heal (toolchain/dependency validation) before retry...');
    run('node ./scripts/check-ios-toolchain.mjs --fix', 'iOS toolchain self-heal', { exitOnError: false });
    run('npx expo run:ios --no-bundler', 'Expo iOS build/install self-heal retry', { exitOnError: false, env: { EXPO_DEBUG: '1' } });

    console.error('   Automatically retrying with Expo debug diagnostics to surface a root cause...');
    const verboseCommand = 'npx expo run:ios --no-bundler';
    const verboseAttempt = run(verboseCommand, 'Expo iOS simulator build/install (debug retry)', { exitOnError: false, env: { EXPO_DEBUG: '1' } });

    if (verboseAttempt.ok) {
      return;
    }

    console.error('');
    console.error('   Suggested follow-up steps:');
    console.error('   1) Refresh Expo iOS native artifacts after dependency updates:');
    console.error('      npm run ios:prebuild -w @dominion/mobile');
    console.error('   2) Open ios/*.xcworkspace in Xcode and build once to inspect signing/runtime errors.');
    console.error('   3) If this began after an SDK/RN upgrade, delete apps/mobile/ios and prebuild again.');
    console.error('   4) If you hit `EXReactRootViewFactory.h ... RCTDevMenuConfiguration ... expected a type`,');
    console.error('      regenerate iOS artifacts from scratch:');
    console.error('      rm -rf apps/mobile/ios');
    console.error('      npm run ios:prebuild -w @dominion/mobile');

    process.exit(verboseAttempt.status || 1);
  }

  process.exit(baseAttempt.status || 1);
}

const iosSimulator = readFlag('iosSimulator');
const androidSimulator = readFlag('androidSimulator');
const cleanPrebuild = readFlag('cleanPrebuild');

if (rawArgs.includes('--ios') || rawArgs.includes('--android')) {
  logDiagnostic('Detected Expo platform arg (--ios/--android). These now only control expo start and no longer trigger simulator build bootstrap; use --iosSimulator or --androidSimulator for build/install.');
}

logDiagnostic('Execution context', {
  cwd: projectRoot,
  node: process.version,
  platform: process.platform,
  rawArgs
});
logDiagnostic('Resolved platform flags', { iosSimulator, androidSimulator, cleanPrebuild });

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
  run('node ./scripts/check-ios-toolchain.mjs --fix', 'iOS toolchain check + self-heal');

  if (cleanPrebuild) {
    run('CI=1 npx expo prebuild --platform ios --clean', 'Expo iOS prebuild (clean)');
  } else {
    logDiagnostic('Skipping automatic iOS prebuild; pass --cleanPrebuild to regenerate iOS native project files before build');
  }

  const targetSimulatorUdid = resolveIosSimulatorUdid();
  const hasTargetSimulator = ensureBootedSimulator(targetSimulatorUdid);
  const isInstalledOnTarget = hasTargetSimulator && isInstalledOnSimulator(targetSimulatorUdid, bundleIdentifiers);

  if (!isInstalledOnTarget) {
    logDiagnostic('No installed iOS development build detected on target simulator; running Expo iOS build/install bootstrap');
    runIosBuildWithDiagnostics();
  } else {
    logDiagnostic('Detected installed iOS development build on target simulator; skipping Expo run:ios bootstrap to continue directly to Expo Metro start');
  }
}

if (androidSimulator) {
  console.log('\n🔧 Preparing Android development client (emulator build + install)...');
  run('npx expo run:android --no-bundler', 'Expo Android emulator build/install');
}

const passthroughArgs = stripControlFlags(rawArgs);

const hasExplicitHostArg = hasExpoHostArg(passthroughArgs);
if (iosSimulator && !hasExplicitHostArg) {
  logDiagnostic('Defaulting Expo host to localhost for iOS simulator (override with --host lan or --host tunnel)');
}

// Intentionally do not auto-append --ios/--android to `expo start`.
// Those flags trigger a one-shot "open on device" flow that can cause the
// process to exit after launch in some environments. We bootstrap install via
// `expo run:<platform> --no-bundler` above, then keep Metro alive here.

const scheme = readExpoScheme();
if (scheme && (iosSimulator || androidSimulator) && !passthroughArgs.includes('--scheme')) {
  passthroughArgs.push('--scheme', scheme);
}

const defaultHost = hasExplicitHostArg ? null : (iosSimulator ? 'localhost' : 'lan');
const expoArgs = passthroughArgs.join(' ');
const startCommandParts = ['npx expo start --dev-client'];
if (defaultHost) {
  startCommandParts.push(`--host ${defaultHost}`);
}
if (expoArgs.length > 0) {
  startCommandParts.push(expoArgs);
}
const startCommand = startCommandParts.join(' ');

logDiagnostic('Final Expo CLI arguments', passthroughArgs);
logDiagnostic('Resolved Expo host', defaultHost ?? 'explicit flag provided by caller');

console.log('\n🚀 Launching Expo Metro in dev-client mode...');
run(startCommand, 'Expo Metro dev-client start');
