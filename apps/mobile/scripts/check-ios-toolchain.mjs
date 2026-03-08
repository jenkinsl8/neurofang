#!/usr/bin/env node
import { execSync } from "node:child_process";

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

if (hasFailure) {
  console.error("\nUnable to continue iOS build until the issues above are fixed.");
  process.exit(1);
}

console.log("\nAll iOS prerequisites look good. Starting Expo iOS build...");
