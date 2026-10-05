# Study Corner — Dev Notes

## Stack
- **Frontend**: Vite + React + TypeScript in `frontend/`. Dev server on port 3000 with HMR.
- **Backend**: Express + TypeScript (tsx watch) in `backend/`. API on port 4000.
- **Storage**: JSON file at `backend/data/store.json` (no database — single-user app).

## Architecture
- Vite dev server proxies `/api` to `http://backend:4000` (single-origin, no CORS needed).
- Active session is polled every 3s globally, every 2s on the Focus page.
- Timer display is computed locally from stored timestamps (startTime, pausedDuration, lastPauseTime), not a local counter. Backend is source of truth.
- 5 themes applied via CSS custom properties on `:root` (see `frontend/src/themes.ts`).

## Dev commands
```
docker compose -f docker-compose.base44.yml up -d --build
docker compose -f docker-compose.base44.yml logs -f
```

## Key files
- `backend/src/store.ts` — session lifecycle + time computation
- `backend/src/stats.ts` — all statistics derivation
- `frontend/src/components/Raccoon.tsx` — SVG raccoon with 5 states
- `frontend/src/themes.ts` — theme definitions
