# Avatar assets

This folder contains local avatar thumbnails used by both web and server fallbacks.

- Keep one image per avatar ID, e.g. `ava-01.svg`, `ava-02.svg`, etc.
- The server endpoint `GET /api/avatars/:avatarId/thumbnail` serves these local files first.
- If an avatar image is missing, the API falls back to `placeholder.svg`.

## Using MakeHuman + Unity assets

1. Create/export pre-rigged MakeHuman interviewers and import to Unity.
2. Build Unity WebGL scenes and publish them under `apps/web/public/unity/...`.
3. Update `apps/server/src/avatarCatalog.ts` with each avatar's `makeHumanModelId` and `unitySceneUrl`.
4. Add/update each avatar thumbnail file in this folder.
