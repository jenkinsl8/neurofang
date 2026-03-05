# Dominion MVP Monorepo

TypeScript monorepo MVP for voice-to-voice interview simulation with OpenAI Realtime over WebRTC.

## Workspace layout

- `apps/server` – Express API: session relay + avatar APIs.
- `apps/web` – Next.js interview UI + 3D interviewer.
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
OPENAI_REALTIME_MODEL=gpt-4o-realtime-preview
OPENAI_REALTIME_VOICE=alloy
OPENAI_IMAGE_MODEL=gpt-image-1
PORT=8787
AZURE_SPEECH_KEY=
AZURE_SPEECH_REGION=
ENABLE_MEDIAPIPE_METRICS=false
```

`apps/web/.env.local` (optional override):

```bash
NEXT_PUBLIC_SERVER_URL=http://localhost:8787
```

`apps/mobile/.env` (required for LAN device testing):

```bash
EXPO_PUBLIC_SERVER_URL=http://192.168.1.X:8787
```

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

## OpenAI Realtime Unified Interface flow

1. Client creates WebRTC offer SDP.
2. Client `POST`s `{ sdp, intake, avatarId }` to `apps/server /session`.
3. Server forwards to `https://api.openai.com/v1/realtime/calls` with multipart form data:
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

## Avatar assets

This repo includes default local SVG avatars as a fallback, and now supports on-demand AI generation of photorealistic interviewer photos via `GET /api/avatars/:avatarId/thumbnail`. Generated images are cached to `apps/server/data/generated-avatars` and reused.

To upgrade to full 3D interviewers, add your own GLB assets:
1. Create/export full-body avatar from Ready Player Me (or another source you have rights to use).
2. Ensure ARKit-compatible blendshapes are present (`jawOpen`, `eyeBlinkLeft`, `eyeBlinkRight`).
3. Place GLB files in `apps/web/public/avatars` using `ava-01`...`ava-16` naming.
4. Keep `apps/server/src/avatarCatalog.ts` IDs synchronized with files.


If you want realistic photo thumbnails (instead of cartoons):
1. Set `OPENAI_API_KEY` in `apps/server/.env`.
2. (Optional) change `OPENAI_IMAGE_MODEL` from the default `gpt-image-1`.
3. Start the server and open the web app avatar picker; the server will generate and cache professional headshot-style thumbnails per avatar ID.

## 3D web interviewer behavior

`apps/web` renders a head-and-shoulders interviewer using `react-three-fiber` + `drei` and applies:
- idle motion
- blink animation
- listening nods
- audio-driven lip sync from remote stream analyzer
- jaw-bone rotation fallback when ARKit blendshape is missing

## Optional modules scaffold

- Azure Pronunciation Assessment scaffold lives in `apps/server/src/optionalModules.ts` and is inactive unless Azure env vars are provided.
- MediaPipe metrics scaffold is present and disabled unless `ENABLE_MEDIAPIPE_METRICS=true`.
