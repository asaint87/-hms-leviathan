// =============================================================================
// Projections — pure functions for deriving world state.
//
// These are the canonical math helpers. Used by the server to:
//   - Convert absolute positions to sub-relative bearing/range for broadcast
//   - Derive Environment.depthZone from Submarine.depth
//   - Derive ReactorSystem.zone from ReactorSystem.temp
//   - Advance Contact positions on every server tick
//
// Used by clients to:
//   - Render contacts on radar/sonar/periscope from bearing+range
//
// The bearing/range convention is:
//   bearing 0   = North (sub looking ahead)
//   bearing 90  = East
//   bearing 180 = South
//   bearing 270 = West
//   East = +x, North = -y (up on screen)
//
// CRITICAL: This file has NO state. It is pure math. Every function is
// deterministic — same inputs → same outputs. Side-effect-free.
// =============================================================================

import type {
  DepthZone,
  Position,
  ReactorZone,
  Speed,
  Velocity,
  World,
} from './types';
import {
  DEPTH_ZONE_BOUNDARIES,
  KNOTS_TO_KMS,
  REACTOR_ZONE_BOUNDARIES,
  SPEED_KMS,
  SPEED_NOISE,
  TACTICAL_MAX_KM,
} from './constants';

// -----------------------------------------------------------------------------
// Polar ⇄ Cartesian projections
// -----------------------------------------------------------------------------

/**
 * Convert a sub-relative bearing+range to a screen offset.
 *
 * @param bearingDeg  0-359, where 0 is North (up on screen), clockwise.
 * @param rangeFrac   0-1 normalized to TACTICAL_MAX_KM.
 * @returns           { x, y } where East=+x, North=-y, in the same fractional units.
 *
 * Multiply x,y by the radar/sonar pixel radius to get screen pixels.
 *
 * Used by every station that draws contacts as dots/blips on a circular scope.
 * This is the canonical projection — DO NOT reimplement bearing math anywhere
 * else in the codebase. Import this function instead.
 */
export function bearingRangeToOffset(
  bearingDeg: number,
  rangeFrac: number,
): { x: number; y: number } {
  const rad = (bearingDeg * Math.PI) / 180;
  return {
    x: Math.sin(rad) * rangeFrac,
    y: -Math.cos(rad) * rangeFrac,
  };
}

/**
 * Compute bearing+range from a vantage point to a target point.
 *
 * @param from   Vantage point (typically the submarine's position).
 * @param to     Target point (typically a contact's position).
 * @returns      bearing 0-359 and range 0-1 normalized to TACTICAL_MAX_KM.
 *
 * Range is clamped to [0, 1] — anything beyond TACTICAL_MAX_KM appears at
 * the edge of the scope.
 *
 * Used by the server during broadcast to compute each contact's derived
 * bearing/range relative to the current submarine position.
 */
export function bearingRangeFromPositions(
  from: Position,
  to: Position,
): { bearing: number; range: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const rangeKm = Math.sqrt(dx * dx + dy * dy);
  const range = Math.min(1, rangeKm / TACTICAL_MAX_KM);

  // bearing = atan2(dx, -dy) because North is -y (up on screen)
  let bearing = (Math.atan2(dx, -dy) * 180) / Math.PI;
  if (bearing < 0) bearing += 360;
  return { bearing, range };
}

/**
 * Convert a fractional range (0-1) back to kilometers.
 * Inverse of the (rangeKm / TACTICAL_MAX_KM) normalization.
 */
export function rangeFracToKm(rangeFrac: number): number {
  return rangeFrac * TACTICAL_MAX_KM;
}

// -----------------------------------------------------------------------------
// Derived zone projections
// -----------------------------------------------------------------------------

/**
 * Derive the current depth zone from the submarine's depth (meters).
 * The Environment.depthZone field is computed from this — it should never
 * be set directly.
 */
export function depthZoneFromDepth(depth: number): DepthZone {
  for (const [maxDepth, zone] of DEPTH_ZONE_BOUNDARIES) {
    if (depth <= maxDepth) return zone;
  }
  // Unreachable: the last boundary entry is Infinity. Return CRUSH defensively.
  return 'CRUSH';
}

/**
 * Derive the current reactor zone from core temperature.
 * The ReactorSystem.zone field is computed from this — it should never
 * be set directly.
 */
export function reactorZoneFromTemp(temp: number): ReactorZone {
  for (const [maxTemp, zone] of REACTOR_ZONE_BOUNDARIES) {
    if (temp <= maxTemp) return zone;
  }
  // Unreachable: last entry is Infinity.
  return 'MELTDOWN_RISK';
}

// -----------------------------------------------------------------------------
// Detection
// -----------------------------------------------------------------------------

/**
 * Compute sonar detection range in km from current sonar power level.
 *
 *   detectionRangeKm = (powerLevel / 100) * TACTICAL_MAX_KM
 *
 * At powerLevel 80 → 48km (range fraction 0.8).
 * At powerLevel 100 → full TACTICAL_MAX_KM (60km).
 */
export function detectionRangeKm(powerLevel: number): number {
  const clamped = Math.max(0, Math.min(100, powerLevel));
  return (clamped / 100) * TACTICAL_MAX_KM;
}

/**
 * Lookup the propulsion noise level (0-100) for a given submarine speed
 * setting. Returns the value from SPEED_NOISE.
 */
export function noiseFromSpeed(speed: Speed): number {
  return SPEED_NOISE[speed];
}

// -----------------------------------------------------------------------------
// Motion integration
// -----------------------------------------------------------------------------

/**
 * Advance a position by a velocity over a time delta.
 *
 * @param position  Current absolute world position (km).
 * @param velocity  Velocity vector — speed in KNOTS, heading 0-359 degrees.
 * @param dtSec     Time delta in seconds.
 * @returns         New position (km), as a fresh object — does not mutate input.
 *
 * Knots are converted to km/s via KNOTS_TO_KMS. Heading 0 = North, clockwise.
 * The same x = sin(h) * d, y = -cos(h) * d projection used by bearingRangeToOffset.
 *
 * Used by the server tick to advance every contact.
 */
export function applyVelocityKnots(
  position: Position,
  velocity: Velocity,
  dtSec: number,
): Position {
  const speedKms = velocity.speed * KNOTS_TO_KMS;
  const distanceKm = speedKms * dtSec;
  const headingRad = (velocity.heading * Math.PI) / 180;
  return {
    x: position.x + Math.sin(headingRad) * distanceKm,
    y: position.y - Math.cos(headingRad) * distanceKm,
  };
}

/**
 * Advance a position by a SUBMARINE speed enum (km/s lookup) over a time delta.
 * Used by the server tick to advance the submarine's own position.
 *
 * @param position  Current absolute world position (km).
 * @param heading   Submarine heading 0-359 degrees.
 * @param speed     Submarine speed enum.
 * @param dtSec     Time delta in seconds.
 * @returns         New position (km).
 */
export function applySubmarineMotion(
  position: Position,
  heading: number,
  speed: Speed,
  dtSec: number,
): Position {
  const speedKms = SPEED_KMS[speed];
  const distanceKm = speedKms * dtSec;
  const headingRad = (heading * Math.PI) / 180;
  return {
    x: position.x + Math.sin(headingRad) * distanceKm,
    y: position.y - Math.cos(headingRad) * distanceKm,
  };
}

// -----------------------------------------------------------------------------
// Whole-world derived field recomputation
// -----------------------------------------------------------------------------

/**
 * Recompute all derived fields on a World object IN PLACE.
 *
 * Derived fields:
 *   - Environment.depthZone   (from Submarine.depth)
 *   - ReactorSystem.zone      (from ReactorSystem.temp)
 *   - For each Contact:
 *       - bearing             (from sub position → contact position)
 *       - range               (same)
 *
 * Called by the server after any state mutation, before broadcasting.
 * The server's broadcast helper should call this so clients always receive
 * a consistent snapshot.
 *
 * MUTATES the input world. Returns nothing.
 *
 * Why mutate vs return new: the server's tick mutates the world many times
 * per frame; cloning would be wasteful. Server code is the only caller.
 */
export function recomputeDerived(world: World): void {
  // Environment.depthZone from sub depth
  world.environment.depthZone = depthZoneFromDepth(world.submarine.depth);

  // ReactorSystem.zone from temp
  world.systems.reactor.zone = reactorZoneFromTemp(world.systems.reactor.temp);

  // Per-contact bearing/range from sub position
  const subPos = world.submarine.position;
  for (const contact of world.contacts) {
    const { bearing, range } = bearingRangeFromPositions(subPos, contact.position);
    contact.bearing = bearing;
    contact.range = range;
  }
}

