# OwnselfReno — 3D Renovation AI

Mobile-first Next.js prototype: upload a measured floorplan → blank editable 3D house shell, dress rooms from interior photos, chat to edit, confirm wall removals, save drafts and named commits.

## Quick start

```bash
npm install
cp .env.example .env.local
# add OPENAI_API_KEY and AUTH_SECRET to .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Without `OPENAI_API_KEY`, floorplan/photo/chat use offline heuristics so you can still exercise the UI.

## Features (prototype)

- Guest try → login (email OTP; optional Google) to persist
- Draft autosave + named commits / restore
- Floorplan image → vision extract → blank shell (confidence interrupt)
- Orbit + in-room walk modes
- Catalog furniture (procedural meshes) + materials
- Room photo dress + confirm-gated wall proposals
- Chat full editor (tool calling when API key present)
- Progressive job status + in-app notify marker for long jobs

## Stack

Next.js (Vercel), React Three Fiber, Auth.js, OpenAI API, local `.data/` JSON store for the prototype.

## AI (PlatformAI)

Two environments, two keys/endpoints:

| Where | Base URL | Env file |
|---|---|---|
| **Local** | `https://api.ai.tech.gov.sg/platform/models` | `.env.local` |
| **Vercel** | `https://api-public.ai.tech.gov.sg/platform/models` | Vercel dashboard (see `.env.vercel.local` checklist) |

Also set `PLATFORM_AI_API_KEY` and `AI_VISION_MODEL` / `AI_PHOTO_MODEL` / `AI_CHAT_MODEL` to model IDs **enabled on that key**.

Uses OpenAI-compatible `{base}/v1/chat/completions`.
