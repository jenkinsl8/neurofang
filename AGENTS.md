# Neurofang: AI Interview Coach MVP

## Goal
Build an MVP that includes:
- Web app (Next.js) + Mobile app (Expo dev client) sharing UI/components where possible
- Node/TypeScript backend
- OpenAI Realtime voice-to-voice (WebRTC) using the *Unified Interface* where the client posts SDP to our server and the server forwards it to OpenAI and returns the answer SDP.
- 3D interactive interviewer (Ready Player Me GLB) head-and-shoulders only:
  - idle + blink + subtle head motion
  - listening nods
  - audio-driven lip sync (jawOpen / ARKit blendshapes) with jaw-bone fallback
- User can choose interviewer look; default is “Pick for me” with diversity-aware selection across multiple races and male/female options
- Always business-professional look and persona
- Difficulty levels: friendly / neutral / tough
- Personality engine: friendly / analytical / skeptical / executive
- Scoring scaffolding:
  - Azure Speech Pronunciation Assessment module (optional env vars)
  - MediaPipe face/pose metrics on web (optional toggle)

## Tech requirements
- TypeScript everywhere.
- Monorepo layout:
  - apps/server (Express/Node)
  - apps/web (Next.js)
  - apps/mobile (Expo dev client)
  - packages/shared (types + configs)
- Provide .env.example files and a README with exact run commands.
- Use stable dependencies and keep the MVP runnable locally.

## Realtime requirements
- Web + mobile must connect via WebRTC.
- Do not expose OpenAI API key to clients.
- Use server relay “Unified Interface” SDP flow.

## Deliverables (Definition of Done)
- `npm install` at repo root works
- `npm run dev` starts server + web
- Mobile builds with Expo dev client and can connect to server on LAN
- Avatar picker works and defaults to random diverse interviewer
- 3D avatar loads and animates (blink/nod/lipsync) on web
- README documents how to add Ready Player Me GLBs and thumbnails
