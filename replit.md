# HMS Leviathan — Family Submarine Command Game

## Overview
A real-time multiplayer family game where 1-5 players each take a station aboard the submarine HMS Leviathan. Built as an Expo mobile app targeting iOS, Android, and web.

## Architecture

### Artifacts
- **`artifacts/api-server`** — Express + WebSocket game server (Node.js/TypeScript)
- **`artifacts/mobile`** — Expo React Native app (iOS/Android/Web)
- **`artifacts/mockup-sandbox`** — Vite mockup server (design tooling)

### Key Files

#### API Server
- `src/index.ts` — HTTP server entry, attaches WebSocket via `attachGameServer()`
- `src/gameServer.ts` — Full WebSocket game server: room management, game loop (500ms tick), all action handlers
- `src/app.ts` — Express app with CORS, JSON parsing, pino logging

#### Mobile App
- `app/_layout.tsx` — Root layout: Orbitron+ShareTechMono fonts, GameProvider, Stack nav
- `app/(tabs)/index.tsx` — Lobby screen: name input, role selector, create/join room
- `app/waiting.tsx` — Waiting room: room code display, crew manifest, start button
- `app/game.tsx` — Main game screen: custom station tab bar, renders active station
- `contexts/GameContext.tsx` — WebSocket connection, all game state, all game actions
- `constants/Colors.ts` — HMS color system: amber, teal, green, red, blue; role-specific colors
- `utils/bearingMath.ts` — Canonical bearing/range math (used by all radar/sonar components)
- `utils/sounds.ts` — Web Audio API procedural sounds (web-only, platform-guarded)
- `components/stations/CaptainStation.tsx` — Radar scope, crew status, battle log
- `components/stations/NavigatorStation.tsx` — Heading dial (PanResponder), depth presets, speed control
- `components/stations/SonarStation.tsx` — Sonar scope with sweep animation, contact list, noise levels
- `components/stations/EngineerStation.tsx` — Reactor temp gauge, cooling rods, hull repair, torpedo reload
- `components/stations/WeaponsStation.tsx` — Target lock, fire control, hit probability
- `components/game/HullBar.tsx` — Top status bar (hull %, heading, depth, speed, torpedoes, reactor temp)
- `components/game/CrisisBanner.tsx` — Pulsing red crisis alert banner
- `components/game/VoteOverlay.tsx` — Full-screen vote UI with countdown timer
- `components/game/ActionLog.tsx` — Battle event log with timestamps and color-coded kinds

## Game Design

### Roles
| Key | Name | Primary Color | Responsibility |
|-----|------|---------------|----------------|
| c | Captain | Amber #ffb300 | Command, radar, crew overview |
| n | Navigator | Blue #00cfff | Heading dial, depth, speed |
| s | Sonar | Teal #00e0ff | Ping, contact detection, noise |
| e | Engineer | Orange #ff8c00 | Reactor cooling, hull repair, torpedo reload |
| w | Weapons | Red #ff3030 | Target lock, fire torpedo |

### WebSocket Protocol
All messages are JSON. Client → Server:
- `CREATE_ROOM { name, role }` → `ROOM_CREATED { code }`
- `JOIN_ROOM { code, name, role }` → `ROOM_JOINED { code }`
- `START_GAME` → `GAME_START` broadcast
- `SONAR_PING` → updates enemies, broadcasts `GAME_STATE`
- `SET_HEADING { heading }`, `SET_DEPTH { depth }`, `SET_SPEED { speed }`
- `FIRE_TORPEDO { targetId }` → `TORPEDO_HIT` or `TORPEDO_MISS`
- `REPAIR_HULL` (3s delay, +15%), `REARM_TORPS`
- `SET_COOLING { level }` (0-100%)

Server → Client broadcasts:
- `GAME_STATE { state, players }` — every 500ms game loop tick
- `CRISIS_START / CRISIS_RESOLVE` — reactor meltdown alerts
- `ACTION_LOG { text, kind }` — battle log entries
- `MISSION_COMPLETE / GAME_OVER`

### Game Loop (500ms)
- Reactor temp adjusts based on speed load vs cooling rod %
- At temp ≥ 450°: REACTOR_MELTDOWN crisis triggers, hull damage begins
- Sub position updates based on heading + speed
- Enemies drift with small random bearing/range changes
- Win: all enemies destroyed. Lose: hull = 0

## Fonts
- Orbitron 400/700/900 — display, UI labels
- ShareTechMono 400 — data readouts, log text

## Color System (`constants/Colors.ts`)
- `Colors.bg` = `#060a0d` — main background
- `Colors.amber` = `#ffb300` — primary accent
- `Colors.teal` = `#00e0ff` — sonar/contacts
- `Colors.green` = `#00ff88` — online/healthy
- `Colors.red` = `#ff3030` — danger/weapons
- `Colors.blue` = `#00cfff` — navigator
- `Colors.orange` = `#ff8c00` — engineer/torpedoes
- `Colors.roles[roleKey]` — per-role `{ primary, dim, bg }`

## WebSocket URL
`wss://${EXPO_PUBLIC_DOMAIN}/api/ws` (API server attaches WebSocket on the HTTP upgrade event)

## Development Notes
- Web: Orbitron fonts load via `@expo-google-fonts/orbitron`
- Screen orientation locked to LANDSCAPE on native during game (dynamic import to avoid web crash)
- `expo-screen-orientation` pinned to `~9.0.8` for Expo SDK 54 compatibility
- Deprecated `textShadow*` / `shadow*` props produce console warnings on web (harmless)
- Safe area: 67px top + 34px bottom on web, native insets on device
