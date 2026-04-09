// =============================================================================
// Initial World factory
//
// createInitialWorld() returns the starting state of the game world.
// Used by the server when a new room is created or when START_GAME fires.
//
// Values match the WORLD.md spec for MT0's starting state. When other
// missions need different starting contacts, they can either spawn them
// via SPAWN_CONTACT side effects on their first step or replace the
// world.contacts array entirely on mission init.
//
// All derived fields (Environment.depthZone, ReactorSystem.zone, contact
// bearing/range) are computed via recomputeDerived() before return so the
// returned World is always in a fully-populated, consistent state.
// =============================================================================

import type {
  Contact,
  Crew,
  CrewMember,
  Environment,
  MissionState,
  Submarine,
  Systems,
  World,
} from './types';
import { recomputeDerived } from './projections';

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** An empty crew seat with no player attached. */
function emptyCrewMember(): CrewMember {
  return {
    connected: false,
    playerId: null,
    playerName: null,
    level: 1,
    xp: 0,
  };
}

// -----------------------------------------------------------------------------
// Initial substates
// -----------------------------------------------------------------------------

function initialSubmarine(): Submarine {
  return {
    heading: 45,
    depth: 142,
    speed: '1/3',
    position: { x: 0, y: 0 },
    hullIntegrity: 100,
  };
}

function initialSystems(): Systems {
  return {
    sonar: {
      online: true,
      powerLevel: 80,
      mode: 'PASSIVE',
    },
    weapons: {
      online: true,
      torpedoesLoaded: 4,
      torpedoReserve: 2,
      locked: false,
      lockedContactId: null,
    },
    propulsion: {
      online: true,
      noise: 20,
    },
    reactor: {
      temp: 284,
      output: 75,
      coolingLevel: 60,
      // Derived — recomputeDerived() will set this. Placeholder value:
      zone: 'NORMAL',
    },
    hull: {
      breached: false,
      leakRate: 0,
    },
  };
}

/**
 * The 3 starting contacts for MT0 (per WORLD.md):
 *
 *   id 1: TYPHOON-CLASS  identified  bearing 034  range 0.28  detected   strength 0.9
 *   id 2: UNIDENTIFIED   unknown     bearing 217  range 0.48  undetected strength 0.6
 *   id 3: UNIDENTIFIED   unknown     bearing 289  range 0.72  undetected strength 0.4
 *
 * Sub starts at position (0, 0). Absolute world positions are computed
 * from the spec's bearing+range:
 *   x = sin(bearing) * range_km
 *   y = -cos(bearing) * range_km
 * with range_km = range_frac * 60.
 *
 * Velocities (knots, per Q4 of the schema interview):
 *   - TYPHOON-CLASS moves "slowly and purposefully": 12 knots, heading 025
 *     (slightly NE — generally away from sub but not directly fleeing)
 *   - Unidentified contacts: 8 knots each, headings tuned for variety
 *   - Velocities are placeholders; mission designers will tune for combat feel.
 *
 * Bearing/range fields are placeholders here — recomputeDerived() at the
 * end of createInitialWorld() will fill them in correctly.
 */
function initialContacts(): Contact[] {
  return [
    {
      id: 1,
      // bearing 34, range_km 16.8 → x ≈ 9.39, y ≈ -13.93
      position: { x: 9.39, y: -13.93 },
      velocity: { speed: 12, heading: 25 },
      bearing: 0, // derived
      range: 0,   // derived
      identified: true,
      type: 'TYPHOON-CLASS',
      color: '#ff3333',
      destroyed: false,
      detected: true,
      strength: 0.9,
      style: 'normal',
    },
    {
      id: 2,
      // bearing 217, range_km 28.8 → x ≈ -17.34, y ≈ 23.00
      position: { x: -17.34, y: 23.00 },
      velocity: { speed: 8, heading: 180 },
      bearing: 0, // derived
      range: 0,   // derived
      identified: false,
      type: 'UNIDENTIFIED',
      color: '#ff8c00',
      destroyed: false,
      detected: false,
      strength: 0.6,
      style: 'normal',
    },
    {
      id: 3,
      // bearing 289, range_km 43.2 → x ≈ -40.86, y ≈ -14.06
      position: { x: -40.86, y: -14.06 },
      velocity: { speed: 8, heading: 90 },
      bearing: 0, // derived
      range: 0,   // derived
      identified: false,
      type: 'UNIDENTIFIED',
      color: '#888888',
      destroyed: false,
      detected: false,
      strength: 0.4,
      style: 'normal',
    },
  ];
}

function initialCrew(): Crew {
  return {
    c: emptyCrewMember(),
    n: emptyCrewMember(),
    s: emptyCrewMember(),
    e: emptyCrewMember(),
    w: emptyCrewMember(),
  };
}

function initialMission(): MissionState {
  return {
    activeMissionKey: null,
    currentStep: 0,
    stepConfirmations: {},
    handoffTimer: false,
  };
}

function initialEnvironment(): Environment {
  return {
    // Derived — recomputeDerived() will set this. Placeholder value:
    depthZone: 'SHALLOW',
    oceanRegion: 'NORTH ATLANTIC \u2014 CONTINENTAL SHELF',
    ambientNoise: 25,
    visibility: 80,
    currentSpeed: 2,
    currentBearing: 90,
  };
}

// -----------------------------------------------------------------------------
// createInitialWorld
// -----------------------------------------------------------------------------

/**
 * Build a fresh World object in its starting state.
 *
 * The returned World is fully populated — every derived field has been
 * computed via recomputeDerived() before return. Server code can mutate
 * the returned object freely; it should call recomputeDerived() again
 * before broadcasting to keep derived fields in sync.
 *
 * @returns A new World with no players in any seat, no active mission,
 *          and the 3 default starting contacts.
 */
export function createInitialWorld(): World {
  const world: World = {
    submarine: initialSubmarine(),
    systems: initialSystems(),
    contacts: initialContacts(),
    crew: initialCrew(),
    mission: initialMission(),
    environment: initialEnvironment(),
    alerts: [],
  };
  recomputeDerived(world);
  return world;
}
