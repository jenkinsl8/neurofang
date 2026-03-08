import { spawnSync } from 'node:child_process';
import { collectProxyWarnings, sanitizeProxyEnv } from './build-doctor.mjs';

const MAX_TYPECHECK_ATTEMPTS = 3;

function runCommand(command, args, { env = process.env } = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf-8',
    env
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }

  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  return result;
}

function includesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

export function analyzeTypecheckFailure(output) {
  const missingDependencyTypes = includesAny(output, [
    /Cannot find module '[^']+'/i,
    /Cannot find type definition file for/i,
    /Cannot find name 'process'/i,
    /Entry point of type library '[^']+' specified/i
  ]);

  const installPermissionsIssue = includesAny(output, [/npm error code E403/i, /403 Forbidden/i]);

  return {
    missingDependencyTypes,
    installPermissionsIssue
  };
}

function runBootstrapFix() {
  console.log('[deploy-check] Running bootstrap fix (build doctor).');
  const firstPass = runCommand('node', ['./scripts/build-doctor.mjs', '--fix']);

  if (firstPass.status === 0) {
    return true;
  }

  console.warn('[deploy-check] Bootstrap fix failed. Retrying with sanitized proxy env.');
  const retryWithSanitizedProxy = runCommand('node', ['./scripts/build-doctor.mjs', '--fix'], {
    env: sanitizeProxyEnv(process.env)
  });

  return retryWithSanitizedProxy.status === 0;
}

function runTypecheckWithHealing() {
  for (let attempt = 1; attempt <= MAX_TYPECHECK_ATTEMPTS; attempt += 1) {
    console.log(`[deploy-check] Typecheck attempt ${attempt}/${MAX_TYPECHECK_ATTEMPTS}.`);
    const result = runCommand('npm', ['run', 'typecheck']);

    if (result.status === 0) {
      return true;
    }

    const combinedOutput = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    const diagnosis = analyzeTypecheckFailure(combinedOutput);

    if (!diagnosis.missingDependencyTypes) {
      console.error('[deploy-check] Typecheck failed for non-environment reasons. Stopping automatic healing.');
      return false;
    }

    console.warn('[deploy-check] Typecheck failure appears environment-related (missing dependencies/types).');
    const healed = runBootstrapFix();

    if (!healed) {
      if (diagnosis.installPermissionsIssue) {
        console.error(
          '[deploy-check] Auto-healing could not install dependencies because registry access was denied (E403). '
            + 'Verify npm registry/proxy credentials for this environment.'
        );
      }
      return false;
    }
  }

  console.error('[deploy-check] Typecheck still failed after all healing attempts.');
  return false;
}

function runTests() {
  console.log('[deploy-check] Running test suite.');
  return runCommand('npm', ['run', 'test']).status === 0;
}

export function main() {
  const proxyWarnings = collectProxyWarnings(process.env);
  if (proxyWarnings.length > 0) {
    console.warn('[deploy-check] Detected placeholder proxy configuration:');
    for (const warning of proxyWarnings) {
      console.warn(`- ${warning}`);
    }
  }

  if (!runBootstrapFix()) {
    process.exit(1);
  }

  if (!runTypecheckWithHealing()) {
    process.exit(1);
  }

  if (!runTests()) {
    process.exit(1);
  }

  console.log('[deploy-check] Deploy checks passed.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
