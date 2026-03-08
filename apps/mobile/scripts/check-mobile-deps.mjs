#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const projectRoot = path.resolve(process.cwd());
const requireFromProject = createRequire(path.join(projectRoot, "package.json"));

try {
  const mobilePackage = JSON.parse(readFileSync(path.join(projectRoot, "package.json"), "utf8"));
  const expectedReactNative = mobilePackage.dependencies?.["react-native"];

  if (!expectedReactNative) {
    console.error("❌ Missing react-native dependency declaration in apps/mobile/package.json");
    process.exit(1);
  }

  const installedPackageJson = requireFromProject.resolve("react-native/package.json");
  const installedReactNative = JSON.parse(readFileSync(installedPackageJson, "utf8")).version;
  const normalizedExpected = String(expectedReactNative).replace(/^[~^]/, "");

  if (installedReactNative !== normalizedExpected) {
    console.error("❌ React Native version mismatch in mobile workspace");
    console.error(`   package.json expects: ${expectedReactNative}`);
    console.error(`   node_modules has:    ${installedReactNative}`);
    console.error("   Run from repo root:");
    console.error("     npm install");
    console.error("   Then retry:");
    console.error("     npm run ios:prebuild -w @dominion/mobile");
    process.exit(1);
  }

  console.log(`✅ React Native dependency is synced (${installedReactNative})`);
} catch (error) {
  console.error("❌ Missing or unreadable React Native installation");
  console.error("   Run from repo root:");
  console.error("     npm install");
  console.error(`   Details: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
