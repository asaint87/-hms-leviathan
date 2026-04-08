# HMS Leviathan — WORLD.md
## Single Source of Truth — World State Specification

> The server holds one WORLD object. Every device is a window into it.
> Clients never own state. They only display what the server says is true.

---

## Core Principle

Every player action follows this sequence — no exceptions:

```
Player taps → Client sends action to server → Server validates
→ Server mutates WORLD → Server broadcasts WORLD_UPDATE to all clients
→ All stations re-render from new WORLD state
```

If logic runs on the client without talking to the server first, it is wrong.

---

## The WORLD Object

```typescript
interface World {
  submarine:   Submarine;
  systems:     Systems;
  contacts:    Contact[];
  crew:        Crew;
  mission:     MissionState;
  environment: Environment;
  alerts:      Alert[];
}
```

---

## Submarine

```typescript
interface Submarine {
  heading:       number;    // 0–359 degrees. 0 = North, clockwise.
  depth:         number;    // meters. 0 = surface. Positive = deeper.
  speed:         Speed;     // see Speed enum below
  position:      { x: number; y: number }; // world grid units
  hullIntegrity: number;    // 0–100. 0 = destroyed.
}

type Speed =
  | 'STOP'
  | '1/3'       // Ahead One Third — slow, quiet
  | '2/3'       // Ahead Two Thirds — standard patrol
  | 'FULL'      // Ahead Full — fast, loud
  | 'FLANK'     // Flank Speed — emergency only, high reactor load
  | 'REVERSE';  // Back slow
```

**Starting values for MT0:**
- heading: 045
- depth: 142
- speed: '1/3'
- position: { x: 0, y: 0 }
- hullIntegrity: 100

---

## Depth Zones

Depth determines what the crew can see, do, and survive. Every station
should reflect the current depth zone visually.

| Zone | Depth Range | Label | Color | Notes |
|---|---|---|---|---|
| Surface | 0–10m | SURFACE | `#4da6ff` | Visible from air. Radar exposed. |
| Periscope | 11–25m | PERISCOPE DEPTH | `#00e5cc` | Can raise periscope. Use for visual contact. |
| Shallow | 26–100m | SHALLOW WATER | `#0077cc` | Standard patrol zone. |
| Deep | 101–200m | DEEP WATER | `#004499` | Reduced sonar noise. Harder to detect. |
| Extreme | 201–300m | EXTREME DEPTH | `#002266` | Hull stress begins. Engineer alert. |
| Crush | 301m+ | CRUSH DEPTH | `#ff3333` | Hull integrity degrades. Mission critical. |

**Periscope rule:** Weapons can only raise the periscope when depth ≤ 25m.
**Crush depth rule:** Hull integrity loses 1 point per second below 300m unless Engineer actively manages pressure systems.

---

## Systems

```typescript
interface Systems {
  sonar: {
    online:     boolean;
    powerLevel: number;    // 0–100. Affects detection range.
    mode:       'PASSIVE' | 'ACTIVE';
  };
  weapons: {
    online:        boolean;
    torpedoesLoaded: number;   // 0–6
    torpedoReserve:  number;   // additional stock
    locked:        boolean;
    lockedContactId: number | null;
  };
  propulsion: {
    online:  boolean;
    noise:   number;   // 0–100. Higher speed = higher noise signature.
  };
  reactor: {
    temp:        number;   // degrees. Normal: 284. Critical: 450+.
    output:      number;   // 0–100 power output percentage
    coolingLevel: number;  // 0–100 cooling rod insertion
    zone:        ReactorZone;
  };
  hull: {
    integrity: number;   // mirrors submarine.hullIntegrity
    breached:  boolean;
    leakRate:  number;   // damage per second when breached
  };
}

type ReactorZone =
  | 'COLD'              // temp < 250
  | 'NORMAL'            // 250–299
  | 'ELEVATED'          // 300–379 — engineer should act
  | 'CRITICAL'          // 380–449 — insert rods now
  | 'MELTDOWN_RISK';    // 450+ — crisis event

```

**Starting values for MT0:**
- sonar: online, powerLevel 80, mode PASSIVE
- weapons: online, torpedoesLoaded 4, reserve 2, not locked
- propulsion: online, noise 20
- reactor: temp 284, output 75, coolingLevel 60, zone NORMAL
- hull: integrity 100, not breached, leakRate 0

---

## Contacts

```typescript
interface Contact {
  id:          number;
  bearing:     number;      // 0–359 degrees from submarine
  range:       number;      // 0–1 fraction of tactical display radius
                            // range 1.0 = 60km (TACTICAL_MAX_KM)
  identified:  boolean;     // false = UNIDENTIFIED on all screens
  type:        string;      // e.g. 'TYPHOON-CLASS', 'UNIDENTIFIED', 'UNKNOWN — DEEP SIGNAL'
  color:       string;      // hex — red for hostile, amber for unknown, teal for anomaly
  destroyed:   boolean;
  detected:    boolean;     // false = not yet visible on sonar scope
  strength:    number;      // 0–1 sonar signal strength
  style?:      ContactStyle;
}

type ContactStyle =
  | 'normal'      // standard tactical contact
  | 'pulse-slow'  // deep/anomaly contact — slow diffuse pulse, mysterious
  | 'fragmented'  // damaged or partially visible contact
  | 'corrupted';  // signal warfare — unreliable position data
```

**Range → km conversion:** `rangeKm = range * 60`

**Polar → screen conversion (canonical — use everywhere):**
```typescript
function bearingRangeToOffset(bearingDeg: number, rangeFrac: number) {
  const rad = bearingDeg * Math.PI / 180;
  return {
    x:  Math.sin(rad) * rangeFrac,   // East = +x
    y: -Math.cos(rad) * rangeFrac,   // North = -y (up on screen)
  };
}
```

**Starting contacts for MT0:**
```typescript
[
  { id: 1, bearing: 34,  range: 0.28, identified: true,  type: 'TYPHOON-CLASS',  color: '#ff3333', destroyed: false, detected: true,  strength: 0.9, style: 'normal' },
  { id: 2, bearing: 217, range: 0.48, identified: false, type: 'UNIDENTIFIED',   color: '#ff8c00', destroyed: false, detected: false, strength: 0.6, style: 'normal' },
  { id: 3, bearing: 289, range: 0.72, identified: false, type: 'UNIDENTIFIED',   color: '#888888', destroyed: false, detected: false, strength: 0.4, style: 'normal' },
]
```

**MT0 s8 side effect — spawns:**
```typescript
{ id: 4, bearing: 180, range: 0.95, identified: false, type: 'UNKNOWN — DEEP SIGNAL', color: '#00e5cc', destroyed: false, detected: true, strength: 0.3, style: 'pulse-slow' }
```

---

## Sonar Detection Rules

A contact becomes `detected: true` when:
- Sonar fires an ACTIVE ping AND contact is within detection range
- Detection range = `(systems.sonar.powerLevel / 100) * TACTICAL_MAX_KM`
- At powerLevel 80 → detection range = 48km (range fraction 0.8)
- Contact at range 0.28 (≈17km) → always detected on ping
- Contact at range 0.95 (≈57km) → only detected at very high power

Passive mode detects nothing automatically — only active ping reveals contacts.

---

## Crew

```typescript
interface Crew {
  captain:   CrewMember;
  navigator: CrewMember;
  sonar:     CrewMember;
  engineer:  CrewMember;
  weapons:   CrewMember;
}

interface CrewMember {
  connected:  boolean;
  playerId:   string | null;
  playerName: string | null;
  level:      number;       // skill level for this role — affects difficulty scaling
  xp:         number;
}
```

**Level affects difficulty scaling per SYSTEMS.md:**
- Level 1–2: Wide timing windows, large recovery bands, slow drift
- Level 3–5: Standard windows, moderate difficulty
- Level 6+: Tight windows, moving targets, minimal cues

---

## Mission State

```typescript
interface MissionState {
  activeMissionKey: string | null;   // 'MT0', 'M01', 'M02', etc.
  currentStep:      number;          // 0-indexed step within active mission
  stepConfirmations: Record<string, Record<RoleKey, boolean>>;
  handoffTimer:     boolean;         // true if counting down to next mission
}
```

---

## Environment

```typescript
interface Environment {
  depthZone:    DepthZone;    // derived from submarine.depth — never set directly
  oceanRegion:  string;       // e.g. 'NORTH ATLANTIC', 'GRAYLINE TRENCH'
  ambientNoise: number;       // 0–100. Higher = harder sonar detection.
  visibility:   number;       // 0–100. Affects periscope range.
  currentSpeed: number;       // knots. Ocean current affecting navigation.
  currentBearing: number;     // direction of current
}
```

**Starting environment for MT0:**
- oceanRegion: 'NORTH ATLANTIC — CONTINENTAL SHELF'
- ambientNoise: 25
- visibility: 80
- currentSpeed: 2
- currentBearing: 090

---

## Alerts

```typescript
interface Alert {
  id:        string;
  type:      AlertType;
  message:   string;
  severity:  'info' | 'warn' | 'crit';
  timestamp: number;
  dismissed: boolean;
}

type AlertType =
  | 'HULL_DAMAGE'
  | 'REACTOR_ELEVATED'
  | 'REACTOR_CRITICAL'
  | 'TORPEDO_INCOMING'
  | 'CONTACT_DETECTED'
  | 'CONTACT_LOST'
  | 'DEPTH_WARNING'
  | 'SYSTEM_OFFLINE'
  | 'MISSION_EVENT';
```

---

## What Each Station Reads

Every station receives the full WORLD object on every WORLD_UPDATE.
Each station renders only its relevant slice.

| Station | Primary slice | Secondary slice |
|---|---|---|
| Captain | mission, alerts, crew, submarine (overview) | contacts (radar) |
| Navigator | submarine.heading, submarine.depth, submarine.speed, submarine.position | environment, contacts (for path planning) |
| Sonar | contacts, systems.sonar, submarine.depth | environment.ambientNoise |
| Engineer | systems (all), submarine.hullIntegrity, reactor | alerts |
| Weapons | contacts, systems.weapons, submarine.heading, submarine.depth | mission (for step context) |

---

## WebSocket Message Reference

| Direction | Type | Payload | Purpose |
|---|---|---|---|
| Server → All | `WORLD_UPDATE` | Full World object | Sent after every mutation |
| Server → All | `MISSION_ACTIVE` | MissionThread | New mission started |
| Server → All | `MISSION_STEP_ADVANCE` | { stepIndex, missionKey } | Step advanced |
| Server → All | `MISSION_COMPLETE_OVERLAY` | { title, glitch, body, nextMissionKey, delayMs } | Mission complete |
| Server → All | `ACTION_LOG` | { message, kind } | Battle log entry |
| Server → All | `STOP_TONE` | { tone: string } | Stop looped audio |
| Client → Server | `SONAR_PING` | — | Fires active ping |
| Client → Server | `SET_HEADING` | { heading: number } | Navigator sets heading |
| Client → Server | `SET_DEPTH` | { depth: number } | Navigator sets depth |
| Client → Server | `SET_SPEED` | { speed: Speed } | Navigator sets speed |
| Client → Server | `FIRE_TORPEDO` | { contactId: number } | Weapons fires |
| Client → Server | `LOCK_TARGET` | { contactId: number } | Weapons locks target |
| Client → Server | `CREW_READY` | { role: RoleKey } | Station confirms step |
| Client → Server | `CAPTAIN_ADVANCE` | — | Captain manual advance |
| Client → Server | `START_MISSION` | { missionKey: string } | Start a mission |
| Client → Server | `START_GAME` | — | Host starts session → auto-inits MT0 |

---

## Cascade Failure Chain

Station failures create dependency chains. The server enforces these:

```
Sonar failure     → contacts.detected reset → Navigator loses map → collision risk
Navigator failure → hull damage             → Engineer overloaded → systems degrade
Engineer failure  → systems offline         → Sonar/Weapons degrade
Weapons failure   → threats not cleared     → incoming damage to hull
Captain timeout   → worst-case decision     → all stations get harder
```

The chain runs both ways — great performance at one station helps others.

---

## Tactical Display Constants

```typescript
const TACTICAL_MAX_KM = 60;      // max radar range in km
const RADAR_RINGS_KM  = [15, 30, 45, 60];  // ring labels
const PERISCOPE_DEPTH = 18;      // meters — periscope operational depth
const CRUSH_DEPTH     = 300;     // meters — hull damage begins
const MAX_DEPTH       = 320;     // meters — absolute operational limit
```

---

## Map Interface — Navigator Station

The Navigator station displays a tactical chart of the operational area.
This is the primary map surface in the game.

### Visual Aesthetic

Reference: `map_style_D_clean_military.png` (Replit assets)

The map uses a **dark military chart** style:
- **Background:** Deep navy `#03080f` — matches game UI
- **Depth bands:** Concentric teal-to-navy gradient contours showing ocean depth
  - Shallow shelf: lighter teal `#00e5cc` at low opacity
  - Mid depth: `#004499`
  - Deep ocean: `#002266`
  - Trench/extreme: near black `#000d1a`
- **Grid overlay:** Cyan military grid lines `rgba(0,229,204,0.15)` with lat/lon tick marks
- **Typography:** Orbitron font for all labels — location names, depth readings, bearing markers
- **Compass rose:** Top-right corner, minimal military style

### Scale

The map operates at **tactical scale** — not world scale.

```
Tactical display radius = 60km (TACTICAL_MAX_KM)
Map viewport = approximately 120km × 120km area
Submarine = center of map at all times
```

The world map used in mission select (future feature) operates at a
larger regional scale showing the North Atlantic mission area, trench
locations, and unlocked mission zones. That is a separate component
from the Navigator tactical chart.

### Map Layers (render order, bottom to top)

```
1. Ocean floor depth contours     — static per mission area
2. Military grid                  — always visible
3. Terrain features               — trench walls, seamounts (mission-specific)
4. Contact tracks                 — faint trail lines showing contact movement history
5. Contacts                       — live enemy/unknown positions (from WORLD.contacts)
6. Submarine marker               — center, always visible, rotates with heading
7. Planned course line            — Navigator's drawn path (cyan dashed line)
8. Waypoints                      — Navigator-placed waypoints (tap to set)
9. Depth zone indicator           — color band on map edge showing current zone
10. HUD overlay                   — heading, depth, speed readouts
```

### Submarine Marker

- Center of map always
- Rotates to match `WORLD.submarine.heading`
- Shows a top-down submarine silhouette in amber `#ffb300`
- Speed indicator: small wake lines behind the marker that lengthen with speed

### Contact Rendering on Map

Contacts from `WORLD.contacts` render as:
- `detected: false` → not visible on map
- `detected: true, identified: false` → amber `#ff8c00` dot with "?" label
- `detected: true, identified: true` → red `#ff3333` dot with type label
- `style: 'pulse-slow'` → teal `#00e5cc` diffuse halo, slow pulse, "???" label

Contact position is calculated using `bearingRangeToOffset()` from submarine center.

### Course Planning

Navigator draws courses by:
1. Tapping waypoints on the map
2. A cyan dashed line connects waypoints in order
3. Current planned course line is visible to Navigator only
4. Sub follows the planned course when Navigator confirms

### Depth Contour Data

Mission areas have pre-defined depth contour maps. For MT0–M04
(North Atlantic Continental Shelf / Grayline Trench area):

```
Ocean floor depth zones visible on map:
- Continental shelf (NE quadrant): 100–200m — lighter teal bands
- Open ocean (NW/SW): 200–400m — mid navy
- Grayline Trench (center/SE): 400–800m+ — near black with teal edge highlight
- Trench walls: rendered as slightly textured darker bands
```

The trench is the visual destination of the arc — it should look
deep, narrow, and deliberately foreboding on the map.

### What the Map Does NOT Show

- Real-world geography — this is a fictional North Atlantic region
- Surface weather — future feature
- Other submarines' perspectives — Navigator sees only from HMS Leviathan
- Contacts not yet detected by Sonar

---

## Franchise Scaling Note

This WORLD object is the engine for the entire Odyssey franchise.
Physics skin changes per title — everything else is the same architecture:

| Title | Physics Skin | Depth → | Contacts → | Reactor → |
|---|---|---|---|---|
| HMS Leviathan | Ocean / pressure / sonar | Ocean depth (meters) | Submarines, creatures, anomalies | Nuclear reactor |
| HMS Odyssey | Space / vacuum / sensors | Orbital altitude (km) | Ships, debris, signals | Fusion core |
| HMS Chronos | Time / paradox / navigation | Timeline drift (years) | Events, echoes, paradoxes | Temporal drive |

Build the WORLD engine right once. Swap the skin. Ship three games.

---

*Document version 1.0 — compiled April 2026*
*HMS Leviathan / The Odyssey Franchise*
*Cross-reference: MISSIONS.md, SYSTEMS.md*
