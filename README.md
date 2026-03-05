# Dominion MVP Monorepo

TypeScript monorepo MVP for voice-to-voice interview simulation with OpenAI Realtime over WebRTC.

## Workspace layout

- `apps/server` – Express API: session relay + avatar APIs.
- `apps/web` – Next.js interview UI + Synthesia interviewer stage.
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

This repo includes default local SVG fallbacks and Synthesia-backed interviewer metadata in `apps/server/src/avatarCatalog.ts`.

Thumbnail generation flow:
1. `GET /api/avatars/:avatarId/thumbnail` downloads the configured `synthesiaThumbnailUrl`.
2. The server caches the result at `apps/server/data/generated-avatars/<avatarId>.jpg`.
3. If the download fails, the API falls back to `apps/web/public/avatars/placeholder.svg`.

To switch interviewers to your own Synthesia free-tier set:
1. Create interviewers in Synthesia.
2. Update `synthesiaAvatarId`, `synthesiaEmbedUrl`, and `synthesiaThumbnailUrl` in `apps/server/src/avatarCatalog.ts`.
3. Restart the server and reload the web app to regenerate thumbnails.

## Web interviewer behavior

`apps/web` renders the selected interviewer through a Synthesia embed and overlays realtime voice-activity level from the OpenAI remote audio stream.

## Optional modules scaffold

- Azure Pronunciation Assessment scaffold lives in `apps/server/src/optionalModules.ts` and is inactive unless Azure env vars are provided.
- MediaPipe metrics scaffold is present and disabled unless `ENABLE_MEDIAPIPE_METRICS=true`.
