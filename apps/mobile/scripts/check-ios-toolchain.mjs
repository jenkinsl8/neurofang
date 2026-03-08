#!/usr/bin/env node
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(process.cwd());

const checks = [
  {
    name: "Xcode command line tools",
    command: "xcode-select -p",
    fix: [
      "Install/repair Xcode command line tools:",
      "  xcode-select --install",
      "  sudo xcode-select -s /Applications/Xcode.app/Contents/Developer"
    ]
  },
  {
    name: "iOS simulator control (simctl)",
    command: "xcrun simctl help",
    fix: [
      "Reset Xcode toolchain and verify simulator runtime:",
      "  sudo xcode-select --reset",
      "  xcrun simctl list devices",
      "Then open Xcode -> Settings -> Platforms and install an iOS runtime."
    ]
  },
  {
    name: "CocoaPods CLI",
    command: "pod --version",
    fix: [
      "Install CocoaPods before running expo run:ios:",
      "  sudo gem install cocoapods --no-document",
      "or",
      "  brew install cocoapods"
    ]
  }
];

let hasFailure = false;

for (const check of checks) {
  try {
    execSync(check.command, { stdio: "ignore" });
    console.log(`✅ ${check.name} detected`);
  } catch {
    hasFailure = true;
    console.error(`❌ Missing or broken: ${check.name}`);
    for (const line of check.fix) {
      console.error(`   ${line}`);
    }
  }
}

const dependencyPaths = {
  mobilePackageJson: path.join(projectRoot, "package.json"),
  installedReactNative: path.join(projectRoot, "node_modules", "react-native", "package.json")
};

try {
  const mobilePackage = JSON.parse(readFileSync(dependencyPaths.mobilePackageJson, "utf8"));
  const expectedReactNative = mobilePackage.dependencies?.["react-native"];

  if (!existsSync(dependencyPaths.installedReactNative)) {
    hasFailure = true;
    console.error("❌ Missing mobile dependencies (node_modules/react-native)");
    console.error("   Run workspace install before iOS build:");
    console.error("     npm install");
  } else {
    const installedReactNative = JSON.parse(readFileSync(dependencyPaths.installedReactNative, "utf8")).version;
    const normalizedExpected = String(expectedReactNative ?? "").replace(/^[~^]/, "");

    if (normalizedExpected && installedReactNative !== normalizedExpected) {
      hasFailure = true;
      console.error("❌ React Native version mismatch in mobile workspace");
      console.error(`   package.json expects: ${expectedReactNative}`);
      console.error(`   node_modules has:    ${installedReactNative}`);
      console.error("   Run dependency install to sync versions:");
      console.error("     npm install");
    } else {
      console.log(`✅ React Native dependency is synced (${installedReactNative})`);
    }
  }
} catch (error) {
  hasFailure = true;
  console.error("❌ Unable to verify local mobile dependencies");
  console.error(`   ${error instanceof Error ? error.message : String(error)}`);
}

if (hasFailure) {
  console.error("\nUnable to continue iOS build until the issues above are fixed.");
  process.exit(1);
}

console.log("\nAll iOS prerequisites look good. Starting Expo iOS build...");
