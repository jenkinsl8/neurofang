# Neurofang MVP Monorepo

TypeScript monorepo MVP for voice-to-voice interview simulation with OpenAI Realtime over WebRTC.

## Workspace layout

- `apps/server` – Express API: session proxy + avatar APIs.
- `apps/web` – Next.js interview UI + 3D interviewer.
- `apps/mobile` – Expo dev client + `react-native-webrtc` interview screen.
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

Create `apps/server/.env`:

```bash
OPENAI_API_KEY=sk-...
OPENAI_REALTIME_MODEL=gpt-4o-realtime-preview
OPENAI_REALTIME_VOICE=alloy
PORT=8787

# Optional modules (off by default)
AZURE_SPEECH_KEY=
AZURE_SPEECH_REGION=
ENABLE_MEDIAPIPE_METRICS=false
```

For web client override server URL (optional):

```bash
# apps/web/.env.local
NEXT_PUBLIC_SERVER_URL=http://localhost:8787
```

For mobile (LAN IP needed):

```bash
# apps/mobile/.env
EXPO_PUBLIC_SERVER_URL=http://192.168.1.X:8787
```

## Run web + server together

```bash
npm run dev
```

This starts:
- server on `http://localhost:8787`
- web on `http://localhost:3000`

## OpenAI Realtime Unified Interface flow

1. Client creates WebRTC offer SDP.
2. Client `POST`s `{ sdp, intake, avatarId }` to `apps/server /session`.
3. Server forwards to `https://api.openai.com/v1/realtime/calls` with multipart form data:
   - `sdp` (offer)
   - `session` (json config)
4. Server returns answer SDP as `{ answerSdp }`.
5. Client sets remote description and starts bidirectional audio.

## Avatar catalog and diversity-aware picker

- Starter catalog includes 16 entries (`8 male`, `8 female`) across diverse race groups.
- `/api/avatars` returns all catalog entries.
- `/api/avatars/pick` selects an avatar while de-prioritizing recently used IDs and over-represented race groups from recent picks.
- Recent IDs are persisted in `apps/server/data/recent-avatars.json` (created at runtime).

## Ready Player Me assets (no copyrighted files committed)

This repo ships placeholder avatar paths only.

Add your own RPM assets:
1. Create/export full-body avatar from Ready Player Me.
2. Ensure ARKit-compatible blendshapes are present (`jawOpen`, `eyeBlinkLeft`, `eyeBlinkRight`).
3. Place GLB + PNG thumbnail files in `apps/web/public/avatars` using `ava-01`...`ava-16` naming.
4. Keep `apps/server/src/avatarCatalog.ts` IDs synchronized with files.

## 3D web interviewer behavior

`apps/web` renders a head-and-shoulders interviewer using `react-three-fiber` + `drei` and applies:
- idle motion
- blink animation
- listening nods
- audio-driven lip sync from remote stream analyzer
- jaw-bone rotation fallback when ARKit blendshape is missing

## Mobile app (Expo dev client)

Start Metro for dev client:

```bash
npm run dev:mobile
```

Build dev client (example Android):

```bash
npm run android -w @neurofang/mobile
```

The mobile MVP includes connect/disconnect and WebRTC audio session negotiation. It includes a placeholder for 3D avatar rendering; add `expo-three` and native R3F setup later if needed.

## Optional modules scaffold

- Azure Pronunciation Assessment scaffold lives in `apps/server/src/optionalModules.ts` and is inactive unless Azure env vars are provided.
- MediaPipe metrics scaffold is present and disabled unless `ENABLE_MEDIAPIPE_METRICS=true`.
