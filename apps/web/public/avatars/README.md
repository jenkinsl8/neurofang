# Avatar assets

- `ava-01.svg` ... `ava-16.svg`: local fallback interviewer thumbnails.
- `placeholder.svg`: generic fallback used when a thumbnail is unavailable.

Runtime-generated Synthesia thumbnails:
- The server endpoint `GET /api/avatars/:avatarId/thumbnail` downloads the configured Synthesia interviewer thumbnail (`synthesiaThumbnailUrl`) and caches it to `apps/server/data/generated-avatars`.
- If download fails, the API falls back to `placeholder.svg`.

To replace interviewers:
1. Create or select interviewers in Synthesia (free tier is supported).
2. Update `apps/server/src/avatarCatalog.ts` with each interviewer's `synthesiaAvatarId`, `synthesiaEmbedUrl`, and `synthesiaThumbnailUrl`.
3. Restart the server and open the avatar picker; thumbnails will be generated and cached automatically.
