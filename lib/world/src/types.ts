// =============================================================================
// HMS Leviathan — World Types
// Single source of truth for the entire game world.
//
// The server holds one World object. Every mutation triggers a full
// WORLD_UPDATE broadcast. Clients render projections of this state — they
// never own state.
//
// Cross-reference: WORLD.md, MISSIONS.md, SYSTEMS.md (project root)
// =============================================================================

// -----------------------------------------------------------------------------
// Roles
// -----------------------------------------------------------------------------

/** Single-char role identifier. Matches the existing engine convention. */
export type RoleKey = 'c' | 'n' | 's' | 'e' | 'w';

// -----------------------------------------------------------------------------
// Position & Velocity (shared geometry)
// -----------------------------------------------------------------------------

/**
 * Absolute world position. 1 unit = 1 km.
 * Used for both the submarine and contacts. World origin (0,0) is arbitrary
 * — positions are absolute relative to the world, not the player.
 */
export interface Position {
  x: number;
  y: number;
}

/**
 * Velocity vector for any moving entity.
 *
 * speed is in KNOTS (more readable in mission data than km/s decimals).
 * Server converts to km/s in tick math via KNOTS_TO_KMS in constants.ts.
 *
 * heading is 0-359 degrees, 0 = North, clockwise (matches submarine convention).
 */
export interface Velocity {
  speed: number;
  heading: number;
}

// -----------------------------------------------------------------------------
// Submarine
// -----------------------------------------------------------------------------

/**
 * Engine speed setting. Player-controlled discrete enum.
 * Numeric values (km/s) live in constants.ts as SPEED_KMS.
 * Speeds are GAME-SCALED, not realistic — tuned for 20-minute family sessions.
 */
export type Speed =
  | 'STOP'
  | '1/3'      // Ahead One Third — slow, quiet
  | '2/3'      // Ahead Two Thirds — standard patrol
  | 'FULL'     // Ahead Full — fast, loud
  | 'FLANK'    // Flank Speed — emergency only, high reactor load
  | 'REVERSE'; // Back slow

/**
 * The player submarine. Special-cased — NOT a Contact.
 * Other vessels (allied, enemy, debris, anomalies) are Contacts.
 */
export interface Submarine {
  /** Compass heading 0-359. 0 = North, clockwise. */
  heading: number;
  /** Depth in meters. 0 = surface. Positive = deeper. */
  depth: number;
  /** Engine speed enum. Numeric km/s comes from SPEED_KMS lookup. */
  speed: Speed;
  /** Absolute world position (km). */
  position: Position;
  /**
   * Hull integrity 0-100. 0 = destroyed.
   * CANONICAL source — single store. Systems.hull holds only breached/leakRate.
   */
  hullIntegrity: number;
}

// -----------------------------------------------------------------------------
// Depth Zones (derived)
// -----------------------------------------------------------------------------

/**
 * Depth band. DERIVED from Submarine.depth via depthZoneFromDepth() —
 * the server NEVER sets this directly. It's always recomputed at broadcast
 * time so clients see a consistent view.
 */
export type DepthZone =
  | 'SURFACE'    //   0–10m
  | 'PERISCOPE'  //  11–25m — periscope can be raised
  | 'SHALLOW'    //  26–100m — standard patrol
  | 'DEEP'       // 101–200m — reduced sonar noise
  | 'EXTREME'    // 201–300m — hull stress begins
  | 'CRUSH';     // 301m+ — hull integrity degrades

// -----------------------------------------------------------------------------
// Systems
// -----------------------------------------------------------------------------

export type SonarMode = 'PASSIVE' | 'ACTIVE';

export interface SonarSystem {
  online: boolean;
  /**
   * 0–100. Affects detection range:
   *   detectionRangeKm = (powerLevel / 100) * TACTICAL_MAX_KM
   */
  powerLevel: number;
  mode: SonarMode;
}

export interface WeaponsSystem {
  online: boolean;
  /** Currently loaded torpedoes 0–6. */
  torpedoesLoaded: number;
  /** Reserve torpedoes available for reload. */
  torpedoReserve: number;
  /** Whether a target is currently locked. */
  locked: boolean;
  /** ID of locked contact, or null if no lock. */
  lockedContactId: number | null;
}

export interface PropulsionSystem {
  online: boolean;
  /**
   * 0–100 acoustic noise signature. Higher speed setting → higher noise.
   * Used by detection rules — louder subs are easier for enemies to detect.
   */
  noise: number;
}

/**
 * Reactor temperature zone. DERIVED from ReactorSystem.temp via
 * reactorZoneFromTemp() — never set directly. Recomputed at broadcast time.
 */
export type ReactorZone =
  | 'COLD'           // temp < 250
  | 'NORMAL'         // 250–299
  | 'ELEVATED'       // 300–379 — engineer should act
  | 'CRITICAL'       // 380–449 — insert rods now
  | 'MELTDOWN_RISK'; // 450+ — crisis event

export interface ReactorSystem {
  /** Core temperature in degrees. Normal operating: 284. Critical: 450+. */
  temp: number;
  /** Power output 0–100 percent. */
  output: number;
  /** Cooling rod insertion 0–100 percent. */
  coolingLevel: number;
  /** DERIVED from temp. */
  zone: ReactorZone;
}

/**
 * Hull system status. NOTE: hull integrity itself lives on Submarine.hullIntegrity
 * (the canonical store). This object only tracks the hull's *system* state —
 * whether it's leaking and how fast.
 */
export interface HullSystem {
  /** Whether the hull is currently leaking. */
  breached: boolean;
  /** Hull damage per second when breached. */
  leakRate: number;
}

export interface Systems {
  sonar: SonarSystem;
  weapons: WeaponsSystem;
  propulsion: PropulsionSystem;
  reactor: ReactorSystem;
  hull: HullSystem;
}

// -----------------------------------------------------------------------------
// Contacts
// -----------------------------------------------------------------------------

/** Visual style variant for sonar/radar/periscope rendering. */
export type ContactStyle =
  | 'normal'      // standard tactical contact
  | 'pulse-slow'  // deep/anomaly contact — slow diffuse pulse, mysterious
  | 'fragmented'  // damaged or partially visible contact
  | 'corrupted';  // signal warfare — unreliable position data

/**
 * A non-submarine entity in the world. Hostile vessels, neutral ships,
 * wreckage, anomalies, anything tracked.
 *
 * STORAGE MODEL:
 *   - `position` (absolute km) and `velocity` (knots) are the canonical state.
 *     Server applies position += velocity * dt every tick (after knot→km/s
 *     conversion).
 *   - `bearing` and `range` are DERIVED at broadcast time, computed relative
 *     to the player submarine's current position. Both are shipped to clients
 *     so each station can use whichever is more ergonomic:
 *       - Sonar / Captain scope use bearing + range
 *       - Navigator map can use absolute position for terrain alignment
 *
 * Mutations update position/velocity. Bearing/range are output-only.
 */
export interface Contact {
  id: number;

  // ---- Authoritative state ----
  /** Absolute world position (km). The single source of truth for this contact. */
  position: Position;
  /** Velocity vector (speed in knots, heading in degrees). */
  velocity: Velocity;

  // ---- Derived state (computed at broadcast time) ----
  /** DERIVED: bearing 0-359 from submarine. */
  bearing: number;
  /** DERIVED: range 0-1 normalized to TACTICAL_MAX_KM. */
  range: number;

  // ---- Identity & visibility ----
  /** Whether this contact has been positively identified. */
  identified: boolean;
  /** Display type, e.g. 'TYPHOON-CLASS', 'UNIDENTIFIED', 'UNKNOWN — DEEP SIGNAL'. */
  type: string;
  /** Display color hex. Red = hostile, amber = unknown, teal = anomaly. */
  color: string;
  /** Whether the contact has been destroyed. */
  destroyed: boolean;
  /** Whether the contact is currently visible on sonar (false until detected). */
  detected: boolean;
  /** Sonar signal strength 0-1. */
  strength: number;
  /** Visual rendering variant. Defaults to 'normal' if absent. */
  style?: ContactStyle;
}

// -----------------------------------------------------------------------------
// Crew
// -----------------------------------------------------------------------------

export interface CrewMember {
  /** Whether a player is currently connected to this seat. */
  connected: boolean;
  /** Internal player id, or null if seat is empty. */
  playerId: string | null;
  /** Display name, or null if seat is empty. */
  playerName: string | null;
  /**
   * Skill level for this role 1+. Affects difficulty scaling per SYSTEMS.md
   * (level 1-2 = wide windows / generous tolerances; level 6+ = tight
   * windows / minimal cues). In-memory only for v1; resets every session.
   * Defaults to 1 at session start.
   */
  level: number;
  /** Experience points earned this session. In-memory only for v1. */
  xp: number;
}

// NOTE: Avatars are intentionally NOT in CrewMember per the World State
// Rule (CLAUDE.md exception #3). Base64 portrait blobs are large; broadcasting
// them in every WORLD_UPDATE causes packet bloat. Avatars are tracked
// separately on the server's Room object and shipped via a one-shot
// AVATARS_SNAPSHOT message on player join, then cached on clients.

/**
 * The crew is a fixed-shape object with one slot per role. Empty seats
 * have connected: false, playerId: null. Single-char keys to match the
 * RoleKey convention used throughout the engine.
 */
export interface Crew {
  c: CrewMember; // Captain
  n: CrewMember; // Navigator
  s: CrewMember; // Sonar
  e: CrewMember; // Engineer
  w: CrewMember; // Weapons
}

// -----------------------------------------------------------------------------
// Mission state
// -----------------------------------------------------------------------------

/**
 * Runtime state of the active mission thread within the world.
 *
 * The mission ENGINE — the MISSION_THREADS registry, the autoConfirmOn /
 * requireState / sideEffects / requireCaptainAdvance machinery — lives in
 * the mission threads module. This is just the *state* shape that records
 * which mission is running and how far it's progressed.
 */
export interface MissionState {
  /** Active mission key, e.g. 'MT0', 'M01'. Null if no mission active. */
  activeMissionKey: string | null;
  /** Current step index within the active mission. 0-indexed. */
  currentStep: number;
  /**
   * Per-step confirmation state: stepId → role → confirmed boolean.
   * When a new step becomes active, all 5 roles are initialized to false.
   */
  stepConfirmations: Record<string, Record<RoleKey, boolean>>;
  /** Whether a handoff timer is currently counting down to the next mission. */
  handoffTimer: boolean;
}

// -----------------------------------------------------------------------------
// Environment
// -----------------------------------------------------------------------------

export interface Environment {
  /** DERIVED from Submarine.depth — never set directly. */
  depthZone: DepthZone;
  /** Display name of current ocean region, e.g. 'NORTH ATLANTIC — CONTINENTAL SHELF'. */
  oceanRegion: string;
  /** Background ocean noise 0-100. Higher = harder sonar detection. */
  ambientNoise: number;
  /** Periscope visibility 0-100. Affects visible periscope range. */
  visibility: number;
  /** Ocean current speed in knots. */
  currentSpeed: number;
  /** Ocean current direction 0-359 degrees. */
  currentBearing: number;
}

// -----------------------------------------------------------------------------
// Alerts
// -----------------------------------------------------------------------------

export type AlertType =
  | 'HULL_DAMAGE'
  | 'REACTOR_ELEVATED'
  | 'REACTOR_CRITICAL'
  | 'TORPEDO_INCOMING'
  | 'CONTACT_DETECTED'
  | 'CONTACT_LOST'
  | 'DEPTH_WARNING'
  | 'SYSTEM_OFFLINE'
  | 'MISSION_EVENT';

export type AlertSeverity = 'info' | 'warn' | 'crit';

export interface Alert {
  /** Stable id, used for client dismissal targeting. */
  id: string;
  type: AlertType;
  message: string;
  severity: AlertSeverity;
  /** Server timestamp (ms) when the alert was created. */
  timestamp: number;
  /** Whether the alert has been dismissed. */
  dismissed: boolean;
}

// -----------------------------------------------------------------------------
// World — root state
// -----------------------------------------------------------------------------

/**
 * The complete game world. Held server-side as the single source of truth.
 * Broadcast in full to all clients on every mutation via WORLD_UPDATE.
 *
 * Every player action follows: client sends action → server validates →
 * server mutates this object → server broadcasts WORLD_UPDATE → clients
 * re-render. No client-side world state. Ever.
 */
export interface World {
  submarine: Submarine;
  systems: Systems;
  contacts: Contact[];
  crew: Crew;
  mission: MissionState;
  environment: Environment;
  alerts: Alert[];
}
