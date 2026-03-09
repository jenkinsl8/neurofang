# Dominion MVP Monorepo

TypeScript monorepo MVP for voice-to-voice interview simulation with OpenAI Realtime over WebRTC.

## Workspace layout

- `apps/server` – Express API: session relay + avatar APIs.
- `apps/web` – Next.js interview UI + interviewer stage.
- `apps/mobile` – Expo dev client + `react-native-webrtc` interview flow.
- `packages/shared` – shared types used by apps.

## Prerequisites

- Node.js 20+
- npm 10+
- For mobile: Xcode/Android Studio + Expo dev client toolchain

## Environment variables

Copy and edit env templates:

```bash
cp apps/server/.env.example apps/server/.env
cp apps/web/.env.local.example apps/web/.env.local
cp apps/mobile/.env.example apps/mobile/.env
```

## One-command smart build validation

Run one command to analyze/fix environment issues, install missing dependencies, typecheck, test, and verify the full workspace build:

```bash
npm run deploy:check
```

What this command does automatically:
- validates Node.js/npm versions
- detects problematic proxy settings that break npm installs
- installs dependencies if `node_modules` is missing (with timeout safeguards)
- creates missing env files from `.env.example` templates
- self-heals typecheck/test failures caused by missing dependencies by re-running bootstrap
- improves iOS self-healing by validating Xcode/simulator toolchain and attempting Expo/CocoaPods dependency repairs during dev-client iOS builds
- runs workspace typechecks
- runs unit tests
- runs build-health test (`npm run build`) so deployments fail fast when build breaks

## Core commands

```bash
npm run dev
npm run dev:mobile
npm run build
npm run doctor
npm run bootstrap
npm run deploy:check
```

## OpenAI Realtime Unified Interface flow

1. Client creates WebRTC offer SDP.
2. Client `POST`s `{ sdp, intake, avatarId }` to `apps/server /session`.
3. Server forwards to `https://api.openai.com/v1/realtime/calls` with multipart form data.
4. Server returns answer SDP as `{ answerSdp }`.
5. Client sets remote description and starts bidirectional audio.

## Avatar and Unity assets

The default interviewer catalog uses `makeHumanModelId` and `unitySceneUrl` from `apps/server/src/avatarCatalog.ts`.

To add/update interviewer assets:
1. Export pre-rigged MakeHuman characters and import into Unity.
2. Build Unity WebGL scene and place it at `apps/web/public/unity/<scene-name>/`.
3. Update `unitySceneUrl` and `makeHumanModelId` in `apps/server/src/avatarCatalog.ts`.
4. Add thumbnails at `apps/web/public/avatars/<avatar-id>.svg|png|jpg|jpeg|webp`.
5. Ensure Unity listens for `window.postMessage` events with `type: "neurofang-stage-state"`.
