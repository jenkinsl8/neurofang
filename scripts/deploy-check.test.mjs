import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeTypecheckFailure } from './deploy-check.mjs';

test('detects missing dependency/type failures', () => {
  const output = `error TS2307: Cannot find module 'express' or its corresponding type declarations.\nerror TS2688: Cannot find type definition file for 'react'.`;

  assert.deepEqual(analyzeTypecheckFailure(output), {
    missingDependencyTypes: true,
    installPermissionsIssue: false
  });
});

test('detects registry permission failures', () => {
  const output = 'npm error code E403\nnpm error 403 Forbidden - GET https://registry.npmjs.org/concurrently';

  assert.deepEqual(analyzeTypecheckFailure(output), {
    missingDependencyTypes: false,
    installPermissionsIssue: true
  });
});

test('keeps non-environment failures as non-healable', () => {
  const output = "error TS2322: Type 'number' is not assignable to type 'string'.";

  assert.deepEqual(analyzeTypecheckFailure(output), {
    missingDependencyTypes: false,
    installPermissionsIssue: false
  });
});
