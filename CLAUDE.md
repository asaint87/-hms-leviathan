# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

HMS Leviathan — a real-time multiplayer submarine command game for 1-5 players. Each player takes a station role (Captain, Navigator, Sonar, Engineer, Weapons) aboard a submarine. Built as a TypeScript monorepo with pnpm workspaces.

## Monorepo Layout

- **`artifacts/api-server`** — Express + WebSocket game server (Node.js, esbuild bundle)
- **`artifacts/mobile`** — Expo React Native app (iOS/Android/Web), file-based routing via Expo Router
- **`artifacts/mockup-sandbox`** — Vite mockup server for design
- **`lib/db`** — Drizzle ORM (PostgreSQL), schema in `src/schema/index.ts`
- **`lib/api-spec`** — OpenAPI spec (`openapi.yaml`), source of truth for API contract
- **`lib/api-zod`** — Zod schemas (generated from OpenAPI via Orval)
- **`lib/api-client-react`** — React Query client (generated from OpenAPI via Orval)
- **`scripts/`** — Utility scripts

## Commands

**Must use pnpm** (enforced via preinstall hook; npm/yarn will fail).

```bash
# Install dependencies
pnpm install

# Typecheck everything (libs first via tsc --build, then artifacts)
pnpm run typecheck

# Build all (typecheck + build each package)
pnpm run build

# Run API server (builds then starts)
cd artifacts/api-server && pnpm run dev

# Run mobile app (Expo dev server)
cd artifacts/mobile && pnpm run dev

# Typecheck a single artifact
cd artifacts/api-server && pnpm run typecheck
cd artifacts/mobile && pnpm run typecheck

# Push database schema
cd lib/db && pnpm run push

# Regenerate API client/schemas from OpenAPI spec
cd lib/api-spec && pnpm run codegen
```

## Architecture

### Real-Time Game Loop
The server runs a 500ms game tick (`gameServer.ts`). Each tick: reactor physics (temp based on speed vs cooling), position updates, enemy drift, hull damage at temp >= 450C. Win condition: all enemies destroyed. Lose condition: hull reaches 0.

### WebSocket Protocol
All game communication uses JSON over WebSocket (`wss://${domain}/api/ws`). The server broadcasts `GAME_STATE` every tick. Clients send action commands (`SET_HEADING`, `FIRE_TORPEDO`, `SONAR_PING`, etc.). Room-based multiplayer with room codes for joining.

### Client State
`contexts/GameContext.tsx` is the central state manager — holds game state, WebSocket connection, and all action dispatch methods. Station components (`components/stations/*Station.tsx`) render role-specific UIs.

### Code Generation Pipeline
`lib/api-spec/openapi.yaml` → Orval (`pnpm run codegen` in api-spec) → generates both `lib/api-zod` (Zod schemas) and `lib/api-client-react` (React Query hooks). Edit the OpenAPI spec, then regenerate — don't edit generated files directly.

### Build
- API server: esbuild (ESM bundle with source maps) → `dist/index.mjs`
- Mobile: Expo Metro bundler + Babel
- Libraries: TypeScript project references (consumed as source, not bundled)

## Key Conventions

- **Role keys**: single char — `c` (Captain), `n` (Navigator), `s` (Sonar), `e` (Engineer), `w` (Weapons)
- **Color system**: defined in `artifacts/mobile/constants/Colors.ts` — use `Colors.roles[roleKey]` for role-specific colors, `Colors.amber/teal/green/red/blue/orange` for semantic colors, `Colors.bg` (#060a0d) for background
- **Fonts**: Orbitron (display/labels), ShareTechMono (data readouts/logs)
- **Bearing math**: use `utils/bearingMath.ts` for all radar/sonar calculations
- **Sounds**: Web Audio API procedural sounds in `utils/sounds.ts` (web-only, platform-guarded)
- **Screen orientation**: locked to landscape on native during game via dynamic import of `expo-screen-orientation`
