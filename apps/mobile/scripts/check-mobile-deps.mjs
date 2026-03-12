#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const workspaceRoot = path.resolve(projectRoot, "..", "..");
const requireFromProject = createRequire(path.join(projectRoot, "package.json"));
const requireFromWorkspaceRoot = createRequire(path.join(workspaceRoot, "package.json"));

function resolvePackageJson(packageName) {
  try {
    return requireFromProject.resolve(`${packageName}/package.json`);
  } catch {
    return requireFromWorkspaceRoot.resolve(`${packageName}/package.json`);
  }
}

function verifyDependency({ packageName, expectedVersion, retryHint }) {
  if (!expectedVersion) {
    console.error(`❌ Missing ${packageName} dependency declaration in apps/mobile/package.json`);
    return false;
  }

  try {
    const installedPackageJson = resolvePackageJson(packageName);
    const installedVersion = JSON.parse(readFileSync(installedPackageJson, "utf8")).version;
    const normalizedExpected = String(expectedVersion).trim();

    if (!isVersionSatisfied(installedVersion, normalizedExpected)) {
      console.error(`❌ ${packageName} version mismatch in mobile workspace`);
      console.error(`   package.json expects: ${expectedVersion}`);
      console.error(`   node_modules has:    ${installedVersion}`);
      console.error("   Run from repo root:");
      console.error("     npm install");
      console.error("   Then retry:");
      console.error(`     ${retryHint}`);
      return false;
    }

    console.log(`✅ ${packageName} dependency is synced (${installedVersion})`);
    return true;
  } catch (error) {
    console.error(`❌ Missing or unreadable ${packageName} installation`);
    console.error("   Run from repo root:");
    console.error("     npm install");
    console.error(`   Details: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

function isVersionSatisfied(installedVersion, expectedRange) {
  const { operator, version } = parseExpectedRange(expectedRange);

  if (operator === "") {
    return installedVersion === version;
  }

  const installedParts = parseSemver(installedVersion);
  const expectedParts = parseSemver(version);

  if (!installedParts || !expectedParts) {
    return false;
  }

  if (operator === "~") {
    return (
      installedParts.major === expectedParts.major &&
      installedParts.minor === expectedParts.minor &&
      compareSemver(installedParts, expectedParts) >= 0
    );
  }

  if (operator === "^") {
    return installedParts.major === expectedParts.major && compareSemver(installedParts, expectedParts) >= 0;
  }

  return false;
}

function parseExpectedRange(value) {
  const firstChar = value.charAt(0);
  const hasRangeOperator = firstChar === "~" || firstChar === "^";

  return {
    operator: hasRangeOperator ? firstChar : "",
    version: hasRangeOperator ? value.slice(1) : value
  };
}

function parseSemver(version) {
  const semverMatch = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!semverMatch) {
    return null;
  }

  return {
    major: Number(semverMatch[1]),
    minor: Number(semverMatch[2]),
    patch: Number(semverMatch[3])
  };
}

function compareSemver(a, b) {
  if (a.major !== b.major) {
    return a.major - b.major;
  }

  if (a.minor !== b.minor) {
    return a.minor - b.minor;
  }

  return a.patch - b.patch;
}

const mobilePackage = JSON.parse(readFileSync(path.join(projectRoot, "package.json"), "utf8"));
const mobileAppConfig = JSON.parse(readFileSync(path.join(projectRoot, "app.json"), "utf8"));

function verifyIosMicrophoneUsageDescription(appConfig) {
  const usageDescription = appConfig?.expo?.ios?.infoPlist?.NSMicrophoneUsageDescription;

  if (typeof usageDescription !== "string" || usageDescription.trim().length === 0) {
    console.error("❌ Missing iOS microphone permission usage description");
    console.error("   apps/mobile/app.json must define expo.ios.infoPlist.NSMicrophoneUsageDescription.");
    console.error("   Without this key, iOS aborts at runtime when microphone capture starts (TCC privacy crash).");
    console.error("   Then regenerate native assets with:");
    console.error("     npm run ios:prebuild -w @dominion/mobile");
    return false;
  }

  console.log("✅ iOS microphone usage description is configured");
  return true;
}

const checks = [
  {
    packageName: "react-native",
    expectedVersion: mobilePackage.dependencies?.["react-native"],
    retryHint: "npm run ios:prebuild -w @dominion/mobile"
  },
  {
    packageName: "expo-dev-client",
    expectedVersion: mobilePackage.dependencies?.["expo-dev-client"],
    retryHint: "npm run start:dev-client -w @dominion/mobile"
  },
  {
    packageName: "event-target-shim",
    expectedVersion: mobilePackage.dependencies?.["event-target-shim"],
    retryHint: "npm run start:dev-client -w @dominion/mobile"
  }
];

const allGood = checks.every(verifyDependency);
const hasMicUsageDescription = verifyIosMicrophoneUsageDescription(mobileAppConfig);

if (!allGood || !hasMicUsageDescription) {
  process.exit(1);
}
