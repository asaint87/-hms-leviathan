# HMS LEVIATHAN — THE ODYSSEY
## Complete Game Specification for Replit Development
### Version 1.0 — April 2026

---

# SECTION 1: WHAT THIS GAME IS

HMS Leviathan is a **family multiplayer submarine game** for 2–5 players, each on their own device (tablet, phone, or browser). Every player has a different role and a different screen. No player can win alone. The game is designed to be played in the same room — players shout orders, confirm actions, and make decisions together out loud.

**The franchise is called The Odyssey.** HMS Leviathan is the first ship (submarine). Future ships are HMS Icarus/Celestia (space) and HMS Meridian (time travel). Everything built now should be extensible to future themes.

**Core design philosophy:**
- Age-appropriate roles. A 5-year-old can play Sonar at Level 1. A 14-year-old plays the same role at Level 14.
- The Captain (typically a parent) is guided by a Mission Thread — a sequential script that tells them exactly what to say and when.
- Missions teach real skills: spatial reasoning, communication, decision-making, accountability.
- After each mission, structured debrief discussion prompts make the game a conversation, not just an activity.
- The game respects family dynamics. Every role matters. No one is a passenger.

---

# SECTION 2: TECHNICAL STACK

## Existing Codebase (already in Replit)
- **Framework:** React Native + Expo (Expo Router for navigation)
- **Backend:** Node.js WebSocket server (raw `ws` library, not Express)
- **Real-time:** WebSocket at `wss://{EXPO_PUBLIC_DOMAIN}/api/ws`
- **State management:** React Context (`GameContext.tsx`)
- **Fonts:** `Orbitron_900Black`, `Orbitron_700Bold`, `Orbitron_400Regular`, `ShareTechMono_400Regular`
- **Icons:** MaterialCommunityIcons, Ionicons (expo-vector-icons)
- **Haptics:** expo-haptics
- **Navigation:** expo-router

## Environment Variables (Replit Secrets)
```
ANTHROPIC_API_KEY=sk-ant-...        # Claude API — vision + AI features
EXPO_PUBLIC_DOMAIN=your-app.replit.app  # Used for WebSocket + API calls
```

## Key File Locations
```
mobile/
  app/
    index.tsx          # Lobby screen (name, role, create/join room)
    game.tsx           # Main game screen (station tabs + hull bar)
    waiting.tsx        # Waiting room after room created
    avatar.tsx         # NEW: Avatar creator screen
  components/
    stations/
      CaptainStation.tsx
      NavigatorStation.tsx
      SonarStation.tsx
      EngineerStation.tsx
      WeaponsStation.tsx
    game/
      HullBar.tsx
      CrisisBanner.tsx
      RepairMinigame.tsx
      TacticalMap.tsx
    AvatarCreator.tsx   # NEW: Selfie → cartoon avatar
  contexts/
    GameContext.tsx     # All shared game state + WebSocket
  constants/
    colors.ts          # Design system colors
  utils/
    sounds.ts          # Web Audio API procedural sounds
  hooks/
    useSounds.ts       # Auto-fires sounds on game state changes
server/
  gameServer.js        # WebSocket game server (main backend)
  avatarRoute.js       # NEW: POST /api/generate-avatar
```

---

# SECTION 3: COLOR SYSTEM

All colors are defined in `constants/colors.ts`. Never hardcode hex values.

```typescript
Colors.bg           = "#060a0d"    // main background
Colors.bgCard       = "rgba(4,14,22,0.92)"
Colors.amber        = "#ffb300"    // Captain + primary accent
Colors.teal         = "#00e0ff"    // Sonar
Colors.green        = "#00ff88"    // success / hull ok
Colors.red          = "#ff3030"    // danger / Weapons
Colors.blue         = "#00cfff"    // Navigator
Colors.orange       = "#ff8c00"    // Engineer

// Per-role colors
Colors.roles.c = { primary: "#ffb300", dim: "#7a5500", bg: "rgba(255,179,0,0.10)" }   // Captain
Colors.roles.n = { primary: "#00cfff", dim: "#004466", bg: "rgba(0,207,255,0.10)" }   // Navigator
Colors.roles.s = { primary: "#00ff88", dim: "#004d28", bg: "rgba(0,255,136,0.10)" }   // Sonar
Colors.roles.e = { primary: "#ff8c00", dim: "#552e00", bg: "rgba(255,140,0,0.10)" }   // Engineer
Colors.roles.w = { primary: "#ff3030", dim: "#550000", bg: "rgba(255,48,48,0.10)" }   // Weapons
```

---

# SECTION 4: GAME ROLES

## Role Keys (used throughout codebase)
```
c = Captain
n = Navigator
s = Sonar
e = Engineer
w = Weapons
```

## Role Descriptions

### CAPTAIN (c) — Ages 8+ minimum
The only player who sees the full picture. Reads mission steps from the Mission Thread. Calls orders out loud. Authorizes fire. Calls crew votes. Leads debriefs. Does NOT play a station minigame — their job is pure command.

### NAVIGATOR (n) — Ages 5+
Controls heading (0–359°), depth (18m–300m), and speed (Stop / 1/3 / 2/3 / Full). Uses a compass wheel with N/E/S/W/NE/SE/SW/NW direction buttons and a vertical throttle lever. Depth presets: Periscope 18m, Shallow 50m, Cruise 142m, Silent 200m, Extreme 300m.

### SONAR (s) — Ages 4+
Active and passive modes. Active: press big PING button, contacts appear on scope. Passive: wear headphones, listen for engine sounds. Sonar scope is a full circular radar display with range rings labeled at 15km / 30km / 45km / 60km. Reports bearings and ranges to Captain. Identifies enemy types using acoustic signature bars.

### ENGINEER (e) — Ages 6+
Manages: hull integrity (repair button, 3-second sequence), reactor temperature (cooling rod slider 0–100%), torpedo rearm (3 reserve → tubes), 5 system panels (ONLINE / DEGRADED / OFFLINE), and power routing. Reactor zones: Normal <300° / Elevated 300–380° / Critical 380–450° / Meltdown Risk 450°+.

### WEAPONS (w) — Ages 6+
Periscope view (full left column, dark ocean with enemy silhouettes). Fire Control panel: contact list with bearing/range/hit%, torpedo tube visual slots (6 tubes), FIRE TORPEDO button. Lock-on progress arc before firing. Hit probability 93% at close range, decreases with distance.

---

# SECTION 5: SHARED GAME STATE

This is the single source of truth. All stations read from it. Server owns it. Clients receive updates via WebSocket.

```typescript
interface GameState {
  hull: number;           // 0–100
  torps: number;          // loaded tubes (0–6)
  torpReserve: number;    // reserve torpedoes (0–6)
  heading: number;        // 0–359 degrees
  depth: number;          // meters
  speed: '1/3' | '2/3' | 'FULL' | 'STOP';
  reactorTemp: number;    // degrees (target: 250–300 normal)
  coolingRods: number;    // 0–100 percent inserted
  power: number;          // 0–100 percent
  systems: SystemStatus[];
  enemies: Enemy[];
  crisisId: string | null;
  missionId: string;      // 'M01' | 'M02' | 'M03' | 'M04' | 'M05'
  missionStep: number;    // current step index in mission thread
  fogGrid: number[][];    // 40x40 fog of war (0=dark, 1=revealed)
  subMapX: number;        // sub position on strategic map (normalized 0–1)
  subMapY: number;
}

interface Enemy {
  id: number;
  bearing: number;        // 0–359 degrees from sub
  range: number;          // 0–1 (fraction of 60km max)
  type: string;           // 'TYPHOON-CLASS' | 'DESTROYER' | 'PATROL SUB' | etc
  identified: boolean;
  detected: boolean;      // has been pinged at least once
  destroyed: boolean;
  col: string;            // hex color for display
  strength: number;       // 0–1 signal strength
}
```

## Canonical Bearing Math
**All displays use this function. Never deviate from it.**
```typescript
function bearingRangeToOffset(bearingDeg: number, rangeFrac: number) {
  const rad = bearingDeg * Math.PI / 180;
  return {
    x:  Math.sin(rad) * rangeFrac,   // East = +x
    y: -Math.cos(rad) * rangeFrac,   // North = -y (up on screen)
  };
}
```
This ensures the Sonar scope, Captain's radar, and Strategic Map all show enemies at identical positions.

---

# SECTION 6: WEBSOCKET MESSAGE PROTOCOL

## Client → Server
```typescript
{ type: 'CREATE_ROOM',   name: string, role: RoleKey }
{ type: 'JOIN_ROOM',     code: string, name: string, role: RoleKey }
{ type: 'START_GAME' }
{ type: 'LEAVE_GAME' }

// Station actions
{ type: 'SONAR_PING' }
{ type: 'SET_HEADING',   heading: number }
{ type: 'SET_DEPTH',     depth: number }
{ type: 'SET_SPEED',     speed: string }
{ type: 'FIRE_TORPEDO',  targetId: number }
{ type: 'REPAIR_HULL' }
{ type: 'REARM_TORPS' }
{ type: 'SET_COOLING',   level: number }

// Mission thread
{ type: 'CREW_TASK_COMPLETE', role: RoleKey, stepId: string }
{ type: 'CAPTAIN_ADVANCE_STEP' }

// Voting
{ type: 'CAST_VOTE',     vote: 'yes' | 'no' }
{ type: 'CAPTAIN_OVERRIDE', decision: 'yes' | 'no' }
```

## Server → All Clients
```typescript
{ type: 'ROOM_CREATED',  code: string }
{ type: 'GAME_STATE',    state: GameState }
{ type: 'MISSION_STEP',  stepIdx: number, confirmations: Record<RoleKey, boolean> }
{ type: 'TASK_CARD',     role: RoleKey, text: string, hint: string, stepId: string }
{ type: 'CRISIS_START',  crisisId: string, def: CrisisDef }
{ type: 'CRISIS_RESOLVE' }
{ type: 'VOTE_STARTED',  context: string, options: string[] }
{ type: 'VOTE_UPDATE',   votes: Record<string, string>, count: number }
{ type: 'VOTE_RESULT',   result: string, tally: Record<string, number> }
{ type: 'TORPEDO_HIT',   targetId: number }
{ type: 'TORPEDO_MISS' }
{ type: 'MISSION_COMPLETE', missionId: string, xp: Record<RoleKey, number> }
{ type: 'ACTION_LOG',    text: string, kind: 'info' | 'kill' | 'warn' | 'crit' }
```

---

# SECTION 7: MISSION THREAD SYSTEM

The Mission Thread is the most important feature for new players. It lives on the Captain's screen and guides the crew step by step through each mission. It must be built before anything else.

## How It Works

1. Captain's right panel shows a sequential list of steps
2. The **active step** shows: a large "SAY THIS NOW" prompt in Orbitron bold (the exact words the Captain should say out loud), a hint for what to watch for, and confirmation pills showing which crew stations have responded
3. When a crew station completes their task, their pill turns green
4. When all required stations confirm → thread auto-advances to next step
5. Captain can also manually advance (for verbal confirmations)
6. Each step pushes a **Task Card** to the relevant crew station(s) — appears at the top of their right panel, slides in with animation
7. The Task Card shows: "YOUR TASK" header in role color, task text in large bold font, hint text, and a "Task Complete — Report to Captain" button

## Captain Screen Layout
```
┌─────────────────────────────────────────────────┐
│ MISSION THREAD                    M01 · ALL HANDS│
│ ████████░░░░░░░░░░░░  STEP 2 OF 6               │
│                                                  │
│ ✓ All stations signed in.                        │
│                                                  │
│ ▶ 2  SAY THIS NOW:                               │
│   ┌────────────────────────────────────┐         │
│   │ "Sonar — ping the water.           │         │
│   │  Find out what's out there."       │         │
│   └────────────────────────────────────┘         │
│   Hint: Wait for Sonar to press PING button      │
│   ● SONAR [waiting]  ◌ NAV  ◌ WEAPONS            │
│   [⏩ ADVANCE (crew confirmed verbally)]          │
│                                                  │
│ ○ 3  Call bearing to Navigator    [locked]       │
│ ○ 4  Authorize Weapons to lock    [locked]       │
│ ○ 5  Give fire order              [locked]       │
└─────────────────────────────────────────────────┘
```

## Mission 01 — ALL HANDS ON DECK (15 min, Training)
```
Step 1: All stations — report to your stations.
  → Task for: sonar, nav, weapons, engineer
  → Each taps "Task Complete"
  → Advances when all 4 confirm

Step 2: "Sonar — ping the water. Let's find out what's out there."
  → Task for: sonar (press PING button)
  → Auto-confirms when SONAR_PING event fires
  
Step 3: "Navigator — come to heading North. Set speed Ahead 1/3."
  → Task for: nav (tap N + set throttle to 1/3)
  → Auto-confirms when heading ~360 and speed = '1/3'

Step 4: "Weapons — raise the periscope. Report what you see."
  → Task for: weapons (switch to periscope view)
  → Manual confirm

Step 5: "Engineer — check all systems. Give me a status report."
  → Task for: engineer (read gauges)
  → Manual confirm

Step 6: "All stations — HMS Leviathan is underway. Good hunting."
  → No crew task. Captain plays Ocean Ambience on soundboard.
  → MISSION COMPLETE
```

## Mission 02 — SEEK AND DESTROY (20–30 min, Easy)
```
Step 1: Battle stations announcement
  → Task for: all stations (acknowledge)

Step 2: "Sonar — ping the water. Find that contact. Tell me the bearing."
  → Task for: sonar
  → Auto-confirms on sonar ping + contact detected

Step 3: "Navigator — come to bearing [X]. Ahead 2/3. Close the distance."
  → Task for: nav (X = bearing of closest enemy)
  → Auto-confirms when heading within 10° of target

Step 4: "Navigator — periscope depth. Take us up to 18 meters."
  → Task for: nav
  → Auto-confirms when depth <= 20

Step 5: "Weapons — raise the scope. Find TYPHOON-CLASS. Lock on. Do not fire yet."
  → Task for: weapons (lock on target)
  → Auto-confirms when target locked

Step 6: "Weapons — you are authorized to fire. Take the shot."
  → Task for: weapons (fire torpedo)
  → Auto-confirms on FIRE_TORPEDO event
```

## Missions 03–05
See Section 14 (Mission Definitions) for M03 Under Fire, M04 The Rescue (moral vote), M05 The Deep (trench navigation).

---

# SECTION 8: LEVEL PROGRESSION SYSTEM

Every player has a level (1–14) per role, stored in their profile. The same mission runs for everyone. Higher-level players do more of the work. Lower-level players get simpler task cards for the same step.

## Level Tiers
```
LV 1–3   Beginner   — follow simple instructions, single actions
LV 4–6   Growing    — execute with some independence
LV 7–10  Advanced   — multi-step coordination, advisory role
LV 11–14 Master     — full autonomous operation, trains others
```

## Age Floors (minimums, not ceilings)
```
Sonar:     4+   (youngest player station)
Navigator: 5+
Weapons:   6+
Engineer:  6+
Captain:   8+   (requires reading + accountability)
```

## Task Cards Are Level-Aware
When the Mission Thread pushes a Task Card to Sonar, it checks that player's `roleLevel.s` and shows:
- LV 1–3: "Press the PING button when Captain says to."
- LV 4–6: "Ping. Report bearing and range: 'Contact bearing 034°, 17km.'"
- LV 7+:  "Ping. Identify contact type. Report bearing, range, movement. Advise Captain on approach."

## XP System
```
Each mission step completed:       +10 XP base
Advanced task (LV 4+ tier):        +15 XP
Master task (LV 7+ tier):          +25 XP
First time completing this step:   +20 XP bonus
Crisis resolved:                   +30 XP
Crew vote participated:            +10 XP
Captain override — correct:        +50 XP (Captain only)
Captain override — wrong:          -20 XP (Captain only)
Mission complete:                  +100 XP
```

Level up thresholds: LV 1→2: 100 XP, LV 2→3: 200 XP, each subsequent level requires 150 more than previous.

---

# SECTION 9: ACCOUNT SYSTEM

## Family Account Structure
- Parent creates main family account (email + password)
- Parent creates child profiles: name, avatar, PIN (4 digits)
- Kids sign in at their station by entering their 4-digit PIN
- No email required for child profiles
- Progress (XP, levels, missions completed) saved per player profile

## PIN Login Flow
1. Lobby screen shows list of family profiles
2. Kid taps their name/avatar
3. Enters 4-digit PIN
4. Logged in — their `roleLevel` is fetched
5. When they join a game room, server knows their level per role
6. Task cards are generated at their level tier

---

# SECTION 10: AVATAR SYSTEM

## Flow
1. Player enters name + selects role
2. Takes selfie or uploads photo
3. Photo sent to backend: `POST /api/generate-avatar`
4. Backend calls Claude vision API (ANTHROPIC_API_KEY in Replit Secrets)
5. Claude analyzes photo → returns character JSON:
   ```json
   {
     "hairColor": "dark brown",
     "skinTone": "warm medium",
     "eyeColor": "brown",
     "ageGroup": "child",
     "distinctiveFeature": "bright smile",
     "crewDescription": "A determined young officer with sharp eyes.",
     "traits": ["Brave", "Focused", "Reliable"],
     "catchphrase": "All stations — stand by."
   }
   ```
6. Frontend renders avatar card with photo as portrait background + role insignia overlay
7. Player accepts → avatar saved to their profile

## Backend Route (`server/avatarRoute.js`)
See the complete implementation in `replit_avatar_route.js` (provided separately). Wire it into the game server:
```javascript
const { handleAvatarGenerate } = require('./avatarRoute');
// In request handler:
if (req.method === 'POST' && req.url === '/api/generate-avatar') {
  return handleAvatarGenerate(req, res);
}
```

## Future: AI Image Generation
The backend route is designed to optionally call an image generation API (Stability AI, Replicate, or fal.ai) after Claude vision analysis, using the character description as a prompt. This is stubbed out with a provider flag (`IMAGE_GEN_PROVIDER = 'none'` → `'stability'` etc). Wire this when ready.

---

# SECTION 11: SOUND SYSTEM

## Existing Procedural Sounds (Web Audio API — no audio files needed)
All implemented in `utils/sounds.ts`. These work on web. For native, use `expo-av` with actual audio files.

```typescript
type SoundType =
  | 'sonarPing'    // descending sine sweep 900→180Hz, 1.8s with echo
  | 'torpedoFire'  // mechanical thud + air rush
  | 'explosion'    // low-pass noise rumble + sub-bass + metallic ring
  | 'alarmStart'   // continuous klaxon (alternating 440/880Hz square wave)
  | 'alarmStop'    // stops klaxon
  | 'hullDamage'   // metallic impact clang (sawtooth harmonics)
  | 'contact'      // rising double-beep (new enemy detected)
  | 'kill'         // rising blip sequence (enemy destroyed)
  | 'click'        // UI tap feedback
  | 'buttonPress'  // button press feedback
```

## Sounds That Need to Be Added

### Theme Song (HIGH PRIORITY)
- A theme melody has been composed by the game designer (to be provided as audio file)
- Plays on the landing/lobby screen on loop, fades when game starts
- Should feel epic, oceanic, slightly ominous — think Hans Zimmer meets ship sonar
- Implementation: `expo-av` Audio.Sound with loop + fade out on game start
- File: `assets/audio/leviathan_theme.mp3`

### Continuous Ambient Game Sounds
These should loop throughout the game, layered:
```
ocean_ambience.mp3      — low ocean hum, water pressure sounds, creaking hull
reactor_hum.mp3         — constant low mechanical hum (increases when reactor hot)
engine_idle.mp3         — engine room ambience (increases with speed)
```

### Passive Sonar Audio (HEADPHONE FEATURE)
When Sonar switches to PASSIVE mode, a notification appears: **"PUT ON HEADPHONES"** with a pulsing animation. Then directional audio plays through headphones:
- Distant engine rumble (bearing-based panning: contact at 90° = right ear)
- Propeller cavitation sounds
- Contact signatures vary by ship type
- Implementation: Web Audio API panner node for directional audio

### Additional Event Sounds Needed
```
depth_change.mp3         — pressure groaning sound when diving deep
periscope_up.mp3         — hydraulic rise sound
torpedo_incoming.mp3     — incoming torpedo warning alarm
victory_fanfare.mp3      — mission complete (short, triumphant)
debrief_chime.mp3        — gentle chime for debrief mode
level_up.mp3             — celebratory sound on level up
reactor_alert.mp3        — Geiger counter clicking (for reactor crisis)
hull_breach.mp3          — rushing water sound (hull damage event)
crew_vote.mp3            — communication buzz (vote started)
```

### Sound Trigger Map
```
Game event                 → Sound
─────────────────────────────────────────
Sonar PING button pressed  → sonarPing
TORPEDO_FIRE event         → torpedoFire
TORPEDO_HIT event          → explosion + victory_fanfare (if last enemy)
TORPEDO_MISS event         → (silence — miss is the sound of nothing)
Hull damage received       → hullDamage + hull_breach (if heavy)
Crisis starts              → alarmStart (continuous until resolved)
Crisis resolved            → alarmStop + relief_chime
New contact detected       → contact
Enemy destroyed            → kill
Periscope raised           → periscope_up
Depth change > 50m         → depth_change
Reactor temp > 380°        → reactor_alert (Geiger clicking)
Mission step complete      → click
Mission complete           → victory_fanfare
Level up                   → level_up
Vote started               → crew_vote
Debrief screen opens       → debrief_chime
```

### useSounds Hook (extends existing)
The existing `useSounds.ts` hook watches game state and auto-fires sounds. Extend it with:
```typescript
// Add to useSounds.ts:
const prevDepth = useRef(gameState?.depth || 142);
const prevReactorTemp = useRef(gameState?.reactorTemp || 280);

// Depth change
useEffect(() => {
  if (!gameState) return;
  if (Math.abs(gameState.depth - prevDepth.current) > 50) {
    playSound('depthChange');
  }
  prevDepth.current = gameState.depth;
}, [gameState?.depth]);

// Reactor alert
useEffect(() => {
  if (!gameState) return;
  if (gameState.reactorTemp > 380 && prevReactorTemp.current <= 380) {
    playSound('reactorAlert');
  }
  prevReactorTemp.current = gameState.reactorTemp;
}, [gameState?.reactorTemp]);
```

---

# SECTION 12: STRATEGIC MAP (FOG OF WAR)

Available on ALL stations via MAP button in header. Opens as full-screen overlay.

## Specifications
- Ocean area: North Atlantic (~800km × 800km)
- Map grid: 40×40 fog cells
- **Fog lifts by distance traveled** — NOT by sonar pings. Navigator heading/depth changes reveal the map around current sub position (70km radius reveal).
- Contacts appear on map only if `enemy.detected === true`
- Bearing math uses canonical `bearingRangeToOffset()` — same positions as radar and sonar

## Named Features on Map (important for M05 missions)
```
Mid-Atlantic Ridge      — shallower band running N–S through center
Puerto Rico Trench      — 8,376m deep, southern area (unlocks in M05)
Grand Banks             — shallow shelf, top-left area
Romanche Fracture Zone  — deep equatorial zone
Azores Islands          — mid-ocean landmark
```

## Depth Color Scale
```
Shallow (<500m):      rgb(6,48,65)    — teal-blue
Mid (500–2000m):      rgb(5,35,68)    — medium blue
Deep (2000–5000m):    rgb(4,22,55)    — dark navy
Trench (5000m+):      rgb(3,10,32)    — near-black, slight purple
Land:                 rgb(18,38,22)   — dark green
```

---

# SECTION 13: CRISIS SYSTEM

Crises are triggered by the server during missions. All stations see a CRISIS BANNER at the top of the screen. Captain's Voice System auto-switches to the Crisis tab.

## Crisis Types
```
HULL_BREACH        — Hull dropping fast. Engineer must repair. Navigator dive/surface.
REACTOR_MELTDOWN   — Reactor temp critical. Engineer insert cooling rods to 95%+.
TORPEDO_INCOMING   — Enemy fired. Navigator must evade (hard turn + depth change).
ENGINES_DOWN       — Speed locked at STOP. Engineer restore propulsion.
SEAL_FAILURE       — (M05 only) Compression failing at depth. Engineer critical repair.
DEAD_SHIP          — All power lost. Engineer restore systems in sequence.
```

## Crisis Resolution
Each crisis has:
- A `crisisId` string
- A per-role `myJob` instruction (shown on each station's Crisis task card)
- A resolution condition (server-side state check)
- A timeout (if unresolved in 3 minutes → hull damage + auto-partial-resolve)

---

# SECTION 14: MISSION DEFINITIONS

## M01 — ALL HANDS ON DECK
- Duration: 15 min | Crew: 2–5 | Difficulty: Training
- Objective: All stations check in and demonstrate their one core action
- No enemies, no crisis
- Success: All stations reported + sonar ping + nav heading + weapons scope + engineer report
- Debrief: "What was your job today? Can you explain it to someone who's never played?"
- Unlocks: M02 | Awards: LV 2 in each player's role

## M02 — SEEK AND DESTROY
- Duration: 20–30 min | Crew: 2–5 | Difficulty: Easy
- Objective: Detect, identify, and sink one enemy contact
- 1 enemy (TYPHOON-CLASS, bearing ~034°, range ~0.28)
- Success: Contact detected + intercept + lock + fire + hit. Hull > 0%.
- Debrief: "Captain — did you override the crew at any point? Was it the right call?"
- Unlocks: M03 | Awards: Combat XP

## M03 — UNDER FIRE
- Duration: 25–35 min | Crew: 3–5 | Difficulty: Medium
- Objective: Destroy both contacts. Survive with hull > 20%. Resolve 1 crisis.
- 2 enemies | 1 guaranteed crisis (TORPEDO_INCOMING)
- Success: Both destroyed + hull > 20% + crisis resolved + no unauthorized fire
- Debrief: "Was there a moment you felt the crew was about to fall apart? What held it together?"
- Unlocks: M04 | Awards: Crisis XP + Engineer bonus

## M04 — THE RESCUE
- Duration: 30–40 min | Crew: 3–5 | Difficulty: Medium + Moral
- Objective: Complete primary mission + crew votes on distress signal response
- Mid-mission: distress signal triggers CREW_VOTE event
- Vote options: "Respond to distress" vs "Stay on mission"
- Captain can override. Outcome logged. No "wrong" answer — only discussion prompts.
- Debrief: "How did you vote, and why? Is there a real-life situation like this?"
- Unlocks: M05 | Awards: Moral Decision XP + museum artifact

## M05 — THE DEEP
- Duration: 40–50 min | Crew: 4–5 | Difficulty: Hard
- Objective: Navigate Puerto Rico Trench. Destroy 3 contacts. Reach installation.
- Trench navigation: precision depth control, collision alerts, narrow passages
- 1 guaranteed SEAL_FAILURE crisis at depth
- Pre-mission: Captain leads crew vote on abort conditions
- Success: Reach installation with hull > 60% + all contacts neutralized + no trench collision
- Debrief: "Did this mission feel different from the first one? How have you grown as a crew?"
- Unlocks: HMS Leviathan ship card + Trench artifact + franchise teaser
- Awards: Campaign complete badge + full crew XP bonuses

---

# SECTION 15: COLLECTIBLES + FRANCHISE SYSTEM

## Ships (unlock across the Odyssey franchise)
```
HMS Leviathan    — submarine (current game)
HMS Icarus       — space vessel (future: The Odyssey — Space)
HMS Meridian     — time ship (future: The Odyssey — Time)
```

## Collectibles Per Mission
Each mission can award one artifact. Artifacts go into:
- **Home Library** (private collection) — player keeps it
- **In-Game Museum** (donate for bonus XP + donor plaque)

## Artifacts by Mission
```
M01: HMS Leviathan commissioning plaque
M02: Enemy vessel identification card (TYPHOON-CLASS)
M03: Battle damage repair log
M04: Rescue crew dossier (or mission report if skipped rescue)
M05: Trench map fragment + deep-sea creature sketch
```

---

# SECTION 16: FUTURE FEATURES (PLANNED — DO NOT BUILD YET)

These are on the roadmap. Build the architecture to accommodate them but do not implement:

1. **WiFi RGB Smart Bulb Sync** — Govee/WLED local API. Game events trigger color changes: red flash = torpedo hit, green = enemy sunk, blue = sonar ping, white pulse = klaxon. Families buy one bulb as part of game setup.

2. **Nuclear Reactor Mission Mechanic** — Engineer station deep-dive: Geiger counter sound, complex cooling rod management, meltdown as major crisis event. Teaches kids about nuclear energy concepts.

3. **Immersive Window Screens** — Extra TVs/tablets act as portholes synced to game depth/state via WebSocket. Underwater view at depth, surface waves at periscope depth, stars for space version.

4. **Variable Crew Size** — Extra roles for larger families (5+): Leak Repair Specialist, Map Researcher, Artifact Hunter, Historical Puzzle Solver, Treasure Hunt Course Plotter. These assist primary stations.

5. **AI Commander from Central Command** — After missions, an AI voice agent (like Duolingo's voice mode) addresses each crew member by role, holds Captain accountable for decisions, hears voice responses. 1+ year out.

6. **Deep Sea Creature Encounters** — Special sonar contacts that behave differently from enemy ships: whales, giant squid (sonar jamming), bioluminescent fish (visual display only). Educational + atmospheric.

7. **Passive Sonar Headphone Mode** — Full spatial audio system: contacts at bearing 090° play louder in right ear. Engine types have distinct audio signatures. Players identify contacts by sound alone.

---

# SECTION 17: UI/UX PRINCIPLES

## Layout
- **Landscape-first** for all game screens (expo-screen-orientation lock)
- **Portrait** for lobby/profile only
- Two-column layout on all station screens:
  - Left column: primary visual (radar / periscope / sonar scope / compass wheel / arc gauges)
  - Right column: controls, task cards, logs, data panels

## Station Visual Hierarchy
Every station screen has this structure:
```
┌─────────────────────────────────────────────────────────┐
│ HULL BAR (full width, top, always visible)              │
│ HDG: 045°  DEPTH: 142m  SPD: 1/3  TORPS: 4+2          │
├─────────────────────────────────────────────────────────┤
│ [Role Icon] STATION NAME    [🗺 MAP]  [subtitle]        │
│ ─────────────────────────────────────────────────────── │
│                  │                                       │
│  PRIMARY         │  CREW TASK CARD (when active)         │
│  VISUAL          │  ─────────────────────────────       │
│  (full height)   │  Primary controls                    │
│                  │  Data panels                         │
│                  │  Log                                 │
└─────────────────────────────────────────────────────────┘
```

## Typography Rules
- Station labels: `Orbitron_900Black`, 18px, letter-spacing 4
- Data values: `Orbitron_700Bold`, varies by importance
- Body text / logs: `ShareTechMono_400Regular`
- Section labels: `Orbitron_400Regular`, 9px, letter-spacing 3, uppercase
- "Say This Now" boxes: `Orbitron_700Bold`, 12–14px, high contrast

## The "Crew Task Card" Design
This is the most important UI element in the game. It must be impossible to miss.
```
┌──────────────────────────────────────────────────┐
│ ● YOUR TASK                        FROM CAPTAIN  │
│                                                  │
│  Press the PING button now.                      │
│                                                  │
│  Tell Captain how many contacts you see.         │
│                                                  │
│  [✓ TASK COMPLETE — REPORT TO CAPTAIN]           │
└──────────────────────────────────────────────────┘
```
- Border and dot color = role color (teal for Sonar, blue for Nav, etc.)
- Task text: Orbitron_700Bold, 13px
- Slides in from top with animation when activated
- Disappears after task complete tapped

---

# SECTION 18: GAME SERVER ARCHITECTURE

The existing server handles WebSocket connections and game rooms. Extend it — do not replace it.

## Room State (server-side)
```javascript
const rooms = new Map(); // roomCode → Room

class Room {
  code: string;
  players: Map<socketId, Player>;
  gameState: GameState;
  missionId: string;
  missionStepIdx: number;
  stepConfirmations: Record<string, Record<RoleKey, boolean>>;
  crisisId: string | null;
  voteState: VoteState | null;
  fogGrid: number[][];
}
```

## Server Game Loop
The server owns all state. Clients send actions, server validates and updates state, broadcasts `GAME_STATE` to all clients in the room every 500ms (or on any state change).

## Mission Thread Server Logic
```javascript
function handleCrewTaskComplete(room, socket, { role, stepId }) {
  const step = MISSION_THREADS[room.missionId].steps[room.missionStepIdx];
  if (step.id !== stepId) return; // ignore stale confirmations

  if (!room.stepConfirmations[stepId]) room.stepConfirmations[stepId] = {};
  room.stepConfirmations[stepId][role] = true;

  // Broadcast updated confirmations to Captain
  broadcastToRoom(room, { type: 'MISSION_STEP', stepIdx: room.missionStepIdx,
    confirmations: room.stepConfirmations[stepId] });

  // Auto-advance if all required roles confirmed
  const allDone = step.waitFor.every(r => room.stepConfirmations[stepId][r]);
  if (allDone) advanceMissionStep(room);
}

function advanceMissionStep(room) {
  const nextIdx = room.missionStepIdx + 1;
  const steps = MISSION_THREADS[room.missionId].steps;
  if (nextIdx >= steps.length) {
    broadcastMissionComplete(room);
    return;
  }
  room.missionStepIdx = nextIdx;
  const nextStep = steps[nextIdx];

  // Push task cards to relevant crew stations
  Object.entries(nextStep.crewTasks || {}).forEach(([role, task]) => {
    broadcastToRole(room, role, { type: 'TASK_CARD', role, ...task,
      stepId: nextStep.id });
  });

  broadcastToRoom(room, { type: 'MISSION_STEP', stepIdx: nextIdx,
    confirmations: {} });
}
```

---

# SECTION 19: WHAT THE HTML DEMO FILE CONTAINS

The file `submarine-game-demo.html` is a complete single-file interactive prototype demonstrating all five stations. It is **not** the production app — it is the design reference. Use it to understand visual design, interactions, and feature completeness.

## What's Working in the Demo
- All 5 station screens with full UI
- Captain radar (animated sweep, shared contacts, bearing callout table)
- Captain voice order system (situational tabs, say-this-now prompts)
- Captain soundboard (12 procedural sounds via Web Audio API)
- Captain drama controls (crisis trigger, torpedo hit, crew vote, debrief)
- Weapons periscope view (scrolling enemy silhouettes, lock-on arc, fire sequence)
- Sonar scope (animated sweep, range rings with km labels, contact blips, waterfall display)
- Navigator compass wheel (smooth animated needle, heading/ordered indicators)
- Navigator throttle (vertical lever, speed buttons, power percentage bar)
- Navigator depth presets (periscope / shallow / cruise / silent / extreme)
- Engineer arc gauges (hull / reactor / power — animated)
- Engineer reactor management (cooling rod slider, temperature zones, meltdown risk)
- Engineer hull repair (3-second animated sequence, synced to hull leak system)
- Engineer torpedo rearm (visual tube slots, reserve count)
- Hull leak system (4 progressive damage tiers — water streaks, drips, pools, cracks)
- Crew vote overlay (full-screen, countdown timer, tally, Captain override)
- Mission debrief (XP reveal animation, rank system, discussion prompts)
- Strategic map (fog of war, bathymetric depth coloring, contacts, sub position)
- Mission thread M01 + M02 (sequential steps, crew task cards, confirmation pills)
- Avatar creator (Claude vision → character JSON → procedural canvas portrait)

## Shared Contact State Architecture
All station visuals use a single `GAME_CONTACTS` array. The canonical bearing formula ensures all displays show identical positions:
```javascript
function bearingRangeToOffset(bearingDeg, rangeFrac) {
  const rad = bearingDeg * Math.PI / 180;
  return { x: Math.sin(rad) * rangeFrac, y: -Math.cos(rad) * rangeFrac };
}
```
This MUST be preserved in the React Native implementation.

---

# SECTION 20: RECOMMENDED BUILD ORDER FOR REPLIT

Build in this sequence. Each phase produces something playable.

## Phase 1 — Real Multiplayer (Week 1)
1. Port existing demo UI into the existing Expo station components
2. Wire all station actions to WebSocket events (the message protocol in Section 6)
3. Implement shared `GAME_STATE` on server with all enemy positions
4. Canonical bearing math in all station displays
5. **Goal: Family can sit in the same room and play a real game**

## Phase 2 — Accounts + Persistence (Week 2)
1. Family account system (parent email + child PIN profiles)
2. Profile creation + PIN login flow on lobby screen
3. Player `roleLevel` stored and fetched per role
4. Avatar creator wired (backend route + React Native component)
5. Progress saves between sessions

## Phase 3 — Mission Thread (Week 3)
1. `MISSION_THREADS` data structure on server (M01 + M02 fully defined)
2. Server-side step advancement logic
3. Captain Mission Thread UI (sequential steps, say-this-now, confirmation pills)
4. Crew Task Cards on all stations (animated slide-in, task complete button)
5. Auto-detection: sonar ping confirms sonar task, heading change confirms nav task
6. Level-aware task cards (check `player.roleLevel[role]`, show correct tier)
7. **Goal: New family can play M01 start to finish without confusion**

## Phase 4 — Sound + Polish (Week 4)
1. Theme song integration (expo-av, lobby loop, fade on game start)
2. Continuous ambient layers (ocean, reactor, engine)
3. All missing event sounds (see Section 11)
4. Passive sonar headphone mode (directional audio, "Put On Headphones" notification)
5. Haptics polish (all buttons, crisis events, level up)
6. **Goal: The room sounds like a submarine**

## Phase 5 — Full Mission Suite (Weeks 5–6)
1. M03 crisis system (TORPEDO_INCOMING auto-trigger)
2. M04 crew vote system (moral decision, logging, debrief prompts)
3. M05 trench navigation (depth precision, collision alerts, seal failure crisis)
4. Mission unlock gates (M01 complete → M02 unlocks, etc.)
5. XP accumulation + level-up notifications
6. Collectibles + artifact awards
7. **Goal: Full campaign playable**

## Phase 6 — App Store Prep
1. iOS build configuration (Expo EAS build)
2. Apple developer account (already held by game designer)
3. App icon, splash screen, store screenshots
4. Family sharing setup
5. TestFlight beta with real families
6. **Goal: App Store submission**

---

# SECTION 21: NAMING CONVENTIONS

```
Game name:        HMS Leviathan
Franchise:        The Odyssey
Current ship:     HMS Leviathan (submarine)
Future ships:     HMS Icarus/Celestia (space), HMS Meridian (time travel)

Previous name:    USS Deepwater (DO NOT USE — replaced by HMS Leviathan)

Room codes:       4 uppercase alphanumeric characters (e.g. "A3X7")
Player IDs:       UUID v4
Role keys:        c, n, s, e, w (single lowercase letter)
Mission IDs:      M01, M02, M03, M04, M05
Step IDs:         s1, s2, s3... (within each mission)
```

---

# SECTION 22: CRITICAL CONSTRAINTS

1. **Never hardcode bearing math.** Always use `bearingRangeToOffset()`. The mirroring bug (where Sonar and Captain showed different enemy positions) was caused by using two different angle conventions. One canonical function, used everywhere.

2. **The fog of war lifts from travel, not pings.** Every time Navigator changes heading or depth, call `revealFog(subNX, subNY, 70)` on the server. Pings do not reveal the map.

3. **Captain is guided, not autonomous.** The Mission Thread must always have a visible current step with "SAY THIS NOW" text. Never leave the Captain without guidance in M01 and M02. Autonomy unlocks at higher Captain levels.

4. **Moral decisions have no wrong answer.** M04's rescue vote has `rightChoice: 'both'`. XP is awarded for participation, not outcome. The debrief discussion is the educational moment.

5. **Level system is per-role, per-player.** A player at Sonar LV 9 who switches to Captain starts at Captain LV 1. Levels are not transferable.

6. **The game is designed to be played in the same room.** Latency targets: WebSocket state update < 200ms. Players on the same WiFi network. Game does not support cross-internet play in v1.

7. **Child profiles have no email.** PIN only. No data collection from minors beyond name, avatar, and game progress.

8. **The theme song is a real composition.** Audio file will be provided. Do not generate or substitute. Build the `expo-av` playback infrastructure so it's ready to drop in.
