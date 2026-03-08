#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const projectRoot = path.resolve(process.cwd());
const requireFromProject = createRequire(path.join(projectRoot, "package.json"));

function verifyDependency({ packageName, expectedVersion, retryHint }) {
  if (!expectedVersion) {
    console.error(`❌ Missing ${packageName} dependency declaration in apps/mobile/package.json`);
    return false;
  }

  try {
    const installedPackageJson = requireFromProject.resolve(`${packageName}/package.json`);
    const installedVersion = JSON.parse(readFileSync(installedPackageJson, "utf8")).version;
    const normalizedExpected = String(expectedVersion).replace(/^[~^]/, "");

    if (installedVersion !== normalizedExpected) {
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

const mobilePackage = JSON.parse(readFileSync(path.join(projectRoot, "package.json"), "utf8"));

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
  }
];

const allGood = checks.every(verifyDependency);
if (!allGood) {
  process.exit(1);
}
