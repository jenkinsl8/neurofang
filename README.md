# Dominion MVP Monorepo

TypeScript monorepo MVP for voice-to-voice interview simulation with OpenAI Realtime over WebRTC.

## Workspace layout

- `apps/server` – Express API: session relay + avatar APIs.
- `apps/web` – Next.js interview UI + MakeHuman/Unity interviewer stage.
- `apps/mobile` – Expo dev client + `react-native-webrtc` interview flow.
- `packages/shared` – shared types used by apps.

## Prerequisites

- Node.js 20+
- npm 10+
- For mobile: Xcode/Android Studio + Expo dev client toolchain

## Install

```bash
npm install
```

## Environment variables

Copy and edit env templates:

```bash
cp apps/server/.env.example apps/server/.env
cp apps/web/.env.local.example apps/web/.env.local
cp apps/mobile/.env.example apps/mobile/.env
```

`apps/server/.env`:

```bash
OPENAI_API_KEY=sk-...
OPENAI_REALTIME_MODEL=gpt-realtime
OPENAI_REALTIME_VOICE=alloy
OPENAI_REALTIME_TIMEOUT_MS=20000
PORT=8787
AZURE_SPEECH_KEY=
AZURE_SPEECH_REGION=
ENABLE_MEDIAPIPE_METRICS=false
TRACE_WEBRTC=false
```

`apps/web/.env.local` (optional override):

```bash
NEXT_PUBLIC_SERVER_URL=http://localhost:8787
NEXT_PUBLIC_TRACE_WEBRTC=false
NEXT_PUBLIC_SESSION_REQUEST_TIMEOUT_MS=25000
```

`apps/mobile/.env` (required for LAN device testing):

```bash
EXPO_PUBLIC_SERVER_URL=http://192.168.1.X:8787
EXPO_PUBLIC_TRACE_WEBRTC=false
EXPO_PUBLIC_SESSION_REQUEST_TIMEOUT_MS=25000
```

### Optional trace logging (CLI-enabled)

Enable detailed WebRTC/session trace logs from the command line when debugging connect/disconnect behavior:

```bash
TRACE_WEBRTC=1 NEXT_PUBLIC_TRACE_WEBRTC=1 npm run dev
```

For mobile:

```bash
EXPO_PUBLIC_TRACE_WEBRTC=1 npm run dev:mobile
```

The logs are emitted as:
- `[trace:server][webrtc] ...` in `apps/server`
- `[trace:web][webrtc] ...` in browser devtools console
- `[trace:mobile][webrtc] ...` in Expo/native logs

## Run web + server together

```bash
npm run dev
```

This starts:
- server on `http://localhost:8787`
- web on `http://localhost:3000`

## Run mobile dev client

```bash
npm run dev:mobile
npm run android -w @dominion/mobile
# or
npm run ios -w @dominion/mobile
```

Before the iOS build starts, the mobile workspace now runs a prerequisite check (`npm run ios:check -w @dominion/mobile`) and a clean iOS prebuild (`npm run ios:prebuild -w @dominion/mobile`) so native Podfile changes from Expo/RN upgrades are regenerated before `pod install` (the script uses `CI=1` to suppress Expo prebuild prompts). The prerequisite check also verifies your installed `react-native` version matches `apps/mobile/package.json` to catch stale `node_modules` after dependency bumps.

## Mobile troubleshooting

- If `npm run ios:check -w @dominion/mobile` reports missing prerequisites or a React Native version mismatch, run `npm install` at repo root, then regenerate native files with `npm run ios:prebuild -w @dominion/mobile`, and rerun the command.
- If `npm run dev:mobile` works but `npm run ios -w @dominion/mobile` fails with `Unable to run simctl` / `xcrun simctl ... code: 69`, your Xcode CLI tooling is not usable on that machine.
- Fix locally by resetting and selecting Xcode command line tools, then launching Xcode once to accept licenses:

  ```bash
  sudo xcode-select --reset
  xcode-select --install
  sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
  sudo xcodebuild -license accept
  xcrun simctl list devices
  ```

  If `xcrun simctl list devices` still fails, open Xcode → **Settings** → **Platforms** and install at least one iOS simulator runtime.
- If CocoaPods installation fails during `expo run:ios`, install it manually and verify `pod --version` succeeds:

  ```bash
  sudo gem install cocoapods --no-document
  # or
  brew install cocoapods
  ```

- If `expo run:ios` fails with "Unable to find a specification for ReactAppDependencyProvider depended upon by expo-dev-launcher" during `pod install`, regenerate the iOS project and reinstall pods:

  ```bash
  npm run ios:prebuild -w @dominion/mobile
  cd apps/mobile/ios && pod install --repo-update
  ```

  This usually means the generated iOS native project is stale relative to your Expo/React Native package versions.
- If you see Xcode project warnings about unknown PBX UUIDs during pod install/codegen (for example `attempted to initialize an object with an unknown UUID`), your generated iOS project is likely corrupted/stale. Regenerate it from scratch:

  ```bash
  rm -rf apps/mobile/ios
  npm run ios:prebuild -w @dominion/mobile
  cd apps/mobile/ios && pod install --repo-update
  ```

- You can still develop with a physical iOS device or Android while iOS simulator tooling is unavailable.

## OpenAI Realtime Unified Interface flow

1. Client creates WebRTC offer SDP.
2. Client `POST`s `{ sdp, intake, avatarId }` to `apps/server /session`.
3. Server forwards to `https://api.openai.com/v1/realtime/calls` with multipart form data (using `gpt-realtime` by default):
   - `sdp` (offer)
   - `session` (json config + business-professional interviewer instructions)
4. Server returns answer SDP as `{ answerSdp }`.
5. Client sets remote description and starts bidirectional audio.

## Interview model controls

- Difficulty options: `friendly` / `neutral` / `tough`
- Personality options: `friendly` / `analytical` / `skeptical` / `executive`
- The web and mobile clients send these values in `intake`; server injects them into OpenAI instructions.

## Avatar catalog and diversity-aware picker

- Starter catalog includes 16 entries (`8 male`, `8 female`) across diverse race groups.
- `/api/avatars` returns all catalog entries.
- `/api/avatars/pick` selects an avatar while de-prioritizing recently used IDs and over-represented race groups from recent picks.
- Web and mobile default to “Pick for me” using `/api/avatars/pick`.
- Recent IDs are persisted in `apps/server/data/recent-avatars.json` (created at runtime).

## MakeHuman + Unity interviewer assets

The default interviewer catalog now uses pre-rigged MakeHuman IDs (`makeHumanModelId`) and Unity scene URLs (`unitySceneUrl`) in `apps/server/src/avatarCatalog.ts`.

Current local setup:
1. `apps/web/public/unity/interviewer/index.html` is a lightweight Unity-stage mock that listens for postMessage stage events.
2. `apps/web/components/AvatarStage.tsx` computes voice activity from remote audio and sends `{ speechLevel, isSpeaking, isListening }` to the scene.
3. `/api/avatars/:avatarId/thumbnail` serves local avatar thumbnails (`svg|png|jpg|jpeg|webp`) and falls back to `apps/web/public/avatars/placeholder.*`.

To switch to real Unity WebGL builds with MakeHuman rigs:
1. Export your pre-rigged MakeHuman characters (FBX) and import into Unity.
2. Build a head-and-shoulders scene with idle/blink/nod/lipsync, then export Unity WebGL to `apps/web/public/unity/<scene-name>/`.
3. Update each avatar's `unitySceneUrl` and `makeHumanModelId` in `apps/server/src/avatarCatalog.ts`.
4. Keep thumbnails in `apps/web/public/avatars/<avatar-id>.svg|png|jpg|jpeg|webp` (same extensions supported for `placeholder`).
5. Ensure your Unity runtime listens for `window.postMessage` events with `type: "neurofang-stage-state"`.

## Web interviewer behavior

`apps/web` renders the selected interviewer via a Unity stage URL and overlays realtime voice-activity level from the OpenAI remote audio stream.

## Optional modules scaffold

- Azure Pronunciation Assessment scaffold lives in `apps/server/src/optionalModules.ts` and is inactive unless Azure env vars are provided.
- MediaPipe metrics scaffold is present and disabled unless `ENABLE_MEDIAPIPE_METRICS=true`.
