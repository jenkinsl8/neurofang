#!/usr/bin/env node
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const projectRoot = path.resolve(process.cwd());
const requireFromProject = createRequire(path.join(projectRoot, "package.json"));
const debugEnabled = process.argv.includes("--debug") || process.env.DEBUG_IOS_TOOLCHAIN === "1";

function printDebug(message) {
  if (debugEnabled) {
    console.error(`[debug] ${message}`);
  }
}

function runCheckCommand(command) {
  printDebug(`Running command: ${command}`);

  return execSync(command, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function printCapturedOutput(label, output) {
  if (!output) {
    return;
  }

  const text = String(output).trim();
  if (!text) {
    return;
  }

  for (const line of text.split("\n")) {
    console.error(`   ${label}: ${line}`);
  }
}

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
    name: "available iOS simulator devices",
    command: "xcrun simctl list devices available iOS",
    validate(output) {
      const hasAvailableDevice = output
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .some((line) => {
          const hasDeviceState = /\((Booted|Shutdown|Creating|Shutting Down)\)$/.test(line);
          const hasUuid = /\([0-9a-fA-F-]{36}\)/.test(line);
          const isUnavailable = /\(unavailable,/i.test(line);

          return hasDeviceState && hasUuid && !isUnavailable;
        });

      return hasAvailableDevice;
    },
    fix: [
      "Create or download an iOS Simulator runtime/device:",
      "  1. Open Xcode -> Settings -> Platforms and install an iOS runtime.",
      "  2. Open Simulator.app once and verify at least one iPhone device exists.",
      "If Expo reports \"CommandError: No iOS devices available in Simulator.app\",",
      "this is usually the missing runtime/device state above."
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
    const output = runCheckCommand(check.command);

    if (typeof check.validate === "function" && !check.validate(output)) {
      throw new Error(`Validation failed for command output from: ${check.command}`);
    }

    console.log(`✅ ${check.name} detected`);
    printDebug(`Check passed: ${check.name}`);
  } catch (error) {
    hasFailure = true;
    console.error(`❌ Missing or broken: ${check.name}`);

    if (error instanceof Error) {
      const commandFailed = error;
      if (typeof commandFailed.message === "string" && commandFailed.message.length > 0) {
        console.error(`   Reason: ${commandFailed.message}`);
      }

      if (typeof commandFailed.stack === "string") {
        printDebug(commandFailed.stack);
      }

      if (typeof commandFailed === "object" && commandFailed !== null) {
        const errorWithStreams = commandFailed;
        printCapturedOutput("stdout", errorWithStreams.stdout);
        printCapturedOutput("stderr", errorWithStreams.stderr);
      }
    } else {
      console.error(`   Reason: ${String(error)}`);
    }

    for (const line of check.fix) {
      console.error(`   ${line}`);
    }
  }
}

try {
  const mobilePackagePath = path.join(projectRoot, "package.json");
  const mobilePackage = JSON.parse(readFileSync(mobilePackagePath, "utf8"));
  const expectedReactNative = mobilePackage.dependencies?.["react-native"];

  if (!expectedReactNative) {
    hasFailure = true;
    console.error("❌ Missing react-native dependency declaration in apps/mobile/package.json");
  } else {
    const resolvedReactNativePackageJson = requireFromProject.resolve("react-native/package.json");
    const installedReactNative = JSON.parse(readFileSync(resolvedReactNativePackageJson, "utf8")).version;
    const normalizedExpected = String(expectedReactNative).replace(/^[~^]/, "");

    if (installedReactNative !== normalizedExpected) {
      hasFailure = true;
      console.error("❌ React Native version mismatch in mobile workspace");
      console.error(`   package.json expects: ${expectedReactNative}`);
      console.error(`   node_modules has:    ${installedReactNative}`);
      console.error("   Run dependency install to sync workspace packages:");
      console.error("     npm install");
      console.error("   Then regenerate iOS project files:");
      console.error("     npm run ios:prebuild -w @dominion/mobile");
    } else {
      console.log(`✅ React Native dependency is synced (${installedReactNative})`);
    }
  }
} catch (error) {
  hasFailure = true;
  console.error("❌ Missing or unreadable React Native installation");
  console.error("   Run workspace install before iOS build:");
  console.error("     npm install");
  console.error(`   Details: ${error instanceof Error ? error.message : String(error)}`);
}

if (existsSync(path.join(projectRoot, "ios"))) {
  console.log("✅ iOS native project directory detected (apps/mobile/ios)");
} else {
  console.log("ℹ️  No iOS native directory yet (will be generated by expo prebuild)");
}

if (hasFailure) {
  if (!debugEnabled) {
    console.error("Tip: rerun with DEBUG_IOS_TOOLCHAIN=1 for additional diagnostics.");
  }
  console.error("\nUnable to continue iOS build until the issues above are fixed.");
  process.exit(1);
}

console.log("\nAll iOS prerequisites look good. Starting Expo iOS build...");
