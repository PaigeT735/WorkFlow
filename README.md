# WorkFlow

AI-powered application execution mapping and debugging.

## Architecture

Application
→ Bronto telemetry
→ WorkFlow backend
→ Grok reasoning
→ Interactive application map

## Structure

- `frontend/` — visual application map
- `backend/` — Bronto + Grok integration
- `backend/src/bronto.ts` — Bronto MCP integration
- `backend/src/grok.ts` — Grok integration
- `backend/src/analyzer.ts` — telemetry analysis
- `backend/src/server.ts` — backend server
