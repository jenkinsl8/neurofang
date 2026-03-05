Avatar assets live here.

Included by default:
- `ava-01.svg` ... `ava-16.svg`: local fallback interviewer thumbnails.

AI-generated realistic photos:
- The server endpoint `GET /api/avatars/:avatarId/thumbnail` can generate photorealistic thumbnails using OpenAI (`gpt-image-1` by default).
- Generated files are cached in `apps/server/data/generated-avatars`.
- If generation is unavailable (for example no API key), the app falls back to these local SVG files.

Optional (recommended for full 3D):
- `ava-01.glb` ... `ava-16.glb`: Ready Player Me (or equivalent) GLB avatars with ARKit blendshapes.

If a GLB is missing, the web app falls back to a built-in simple 3D bust so the flow still works.
