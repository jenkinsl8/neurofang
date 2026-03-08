import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const buildCommand = ['run', 'build'];

function runBuild() {
  const result = spawnSync('npm', buildCommand, {
    cwd: process.cwd(),
    encoding: 'utf-8',
    env: {
      ...process.env,
      CI: '1'
    }
  });

  return result;
}

test('workspace build completes without errors', () => {
  const result = runBuild();

  assert.equal(
    result.status,
    0,
    [
      'Expected `npm run build` to succeed.',
      'STDOUT:',
      result.stdout?.trim() || '<empty>',
      'STDERR:',
      result.stderr?.trim() || '<empty>'
    ].join('\n')
  );
});
