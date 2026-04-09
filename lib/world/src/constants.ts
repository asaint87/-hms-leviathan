import type { AlertType, DepthZone, ReactorZone, Speed } from './types';

// =============================================================================
// Tactical display constants
// =============================================================================

/** Maximum tactical range in km. Anything beyond this isn't on the scope. */
export const TACTICAL_MAX_KM = 60;

/** Radar ring labels (km) shown on Captain/Sonar scopes. */
export const RADAR_RINGS_KM: readonly number[] = [15, 30, 45, 60];

// =============================================================================
// Depth constants (meters)
// =============================================================================

/** Operational periscope depth. */
export const PERISCOPE_DEPTH = 18;

/** Maximum depth at which the periscope can be raised. */
export const PERISCOPE_MAX_DEPTH = 25;

/** Hull damage begins below this depth. */
export const CRUSH_DEPTH = 300;

/** Absolute operational limit. Sub will not descend further. */
export const MAX_DEPTH = 320;

/** Hull integrity loss per second below CRUSH_DEPTH (when not actively managed). */
export const CRUSH_DAMAGE_PER_SECOND = 1;

/**
 * Depth zone boundaries. Each entry is [maxDepth (inclusive), zoneName].
 * Used by depthZoneFromDepth() to derive Environment.depthZone.
 *
 *   0–10m   → SURFACE
 *  11–25m   → PERISCOPE
 *  26–100m  → SHALLOW
 * 101–200m  → DEEP
 * 201–300m  → EXTREME
 * 301m+     → CRUSH
 */
export const DEPTH_ZONE_BOUNDARIES: ReadonlyArray<readonly [number, DepthZone]> = [
  [10, 'SURFACE'],
  [25, 'PERISCOPE'],
  [100, 'SHALLOW'],
  [200, 'DEEP'],
  [300, 'EXTREME'],
  [Infinity, 'CRUSH'],
];

// =============================================================================
// Reactor constants
// =============================================================================

/** Normal reactor operating temperature. */
export const REACTOR_NORMAL_TEMP = 284;

/** Temperature at which the reactor enters meltdown risk. */
export const REACTOR_MELTDOWN_TEMP = 450;

/**
 * Reactor temperature zone boundaries. Each entry is [maxTemp (inclusive), zoneName].
 *
 *   <250  → COLD
 * 250–299 → NORMAL
 * 300–379 → ELEVATED
 * 380–449 → CRITICAL
 *  450+   → MELTDOWN_RISK
 */
export const REACTOR_ZONE_BOUNDARIES: ReadonlyArray<readonly [number, ReactorZone]> = [
  [249, 'COLD'],
  [299, 'NORMAL'],
  [379, 'ELEVATED'],
  [449, 'CRITICAL'],
  [Infinity, 'MELTDOWN_RISK'],
];

// =============================================================================
// Submarine speed → km/s lookup
// =============================================================================

/**
 * Maps the Submarine speed enum to km/s. Used by the server tick to advance
 * Submarine.position. Negative for REVERSE.
 *
 * Values are GAME-SCALED for a 20-minute family session, NOT realistic.
 * At FULL (2.0 km/s), crossing 30km of tactical map takes 15 seconds.
 * At 1/3 (0.5 km/s), the same crossing takes 60 seconds. Combat intercepts
 * feel meaningful without becoming tedious.
 *
 * Approximate "feel" mapping:
 *   1/3   ≈ patrol cruise
 *   2/3   ≈ combat approach
 *   FULL  ≈ pursuit / evasion
 *   FLANK ≈ emergency burst (high reactor load)
 *
 * Tune in playtest. Values may need to drop if combat feels too snappy.
 */
export const SPEED_KMS: Record<Speed, number> = {
  STOP: 0,
  '1/3': 0.5,
  '2/3': 1.0,
  FULL: 2.0,
  FLANK: 3.5,
  REVERSE: -0.3,
};

// =============================================================================
// Submarine speed → propulsion noise lookup
// =============================================================================

/**
 * Maps the Submarine speed enum to a propulsion noise value (0-100).
 * Used by detection rules — louder subs are easier for enemies to detect.
 *
 * Values are intentionally non-linear to make speed changes meaningful:
 * patrol speeds (1/3, 2/3) stay quiet enough to be stealthy, FULL is loud,
 * FLANK is essentially screaming "we are here." REVERSE is moderately loud
 * due to wake turbulence at the screws.
 */
export const SPEED_NOISE: Record<Speed, number> = {
  STOP: 5,
  '1/3': 20,
  '2/3': 45,
  FULL: 75,
  FLANK: 100,
  REVERSE: 25,
};

// =============================================================================
// Knots → km/s conversion (for Contact velocity)
// =============================================================================

/**
 * Knots → km/s conversion factor used by the server tick to advance contacts.
 *
 * Real-world: 1 knot = 0.000514 km/s. This game uses an INFLATED factor so
 * contacts move at speeds comparable to the game-scaled submarine (which is
 * ~150× faster than realistic at FULL). Otherwise contacts would appear
 * stationary relative to the player and combat pacing would collapse.
 *
 * At KNOTS_TO_KMS = 0.05:
 *   TYPHOON-CLASS    (12 knots) → 0.6 km/s — slower than sub FULL (2.0), faster than 1/3 (0.5)
 *   Unidentified ship ( 8 knots) → 0.4 km/s — sub at any speed > 1/3 catches it
 *   Deep signal       ( 0 knots) → 0       — stationary
 *
 * This ratio means a TYPHOON 30km away can be intercepted by a sub at FULL
 * in roughly 21 seconds of relative motion. Adjust in playtest.
 */
export const KNOTS_TO_KMS = 0.05;

// =============================================================================
// Alerts
// =============================================================================

/**
 * Alert types that cannot be dismissed by the client. Server resolves these
 * automatically when the underlying world condition resolves.
 *
 * Per WORLD.md: REACTOR_CRITICAL clears when reactor.temp drops below the
 * CRITICAL band. TORPEDO_INCOMING clears when the inbound torpedo is
 * destroyed or evaded. Other alert types can be cleared by any client via
 * the DISMISS_ALERT message.
 */
export const CRITICAL_ALERT_TYPES: ReadonlyArray<AlertType> = [
  'REACTOR_CRITICAL',
  'TORPEDO_INCOMING',
];
