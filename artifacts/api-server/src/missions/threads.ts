// TODO: move to shared lib/missions package — currently duplicated
// in artifacts/mobile/components/game/missionThreads.ts
//
// Mission Thread Engine — schema and registry for HMS Leviathan missions.
// Modeled on the demo prototype's MISSION_THREADS object.

export type RoleKey = 'c' | 'n' | 's' | 'e' | 'w';

/** A single instruction shown on a crew member's task card */
export interface CrewTask {
  /** Imperative instruction shown on the crew's task card */
  text: string;
  /** Secondary line — what to say back to the captain, or how to complete */
  hint: string;
}

/** Definition for a contact to be spawned via SPAWN_CONTACT side effect */
export interface ContactDefinition {
  bearing: number;       // 0-360 degrees
  range: number;         // 0-1 normalized (1 = max display range)
  type: string;          // display name, e.g. "UNKNOWN — DEEP SIGNAL"
  identified?: boolean;  // default false
  detected?: boolean;    // default false
  col?: string;          // hex color, default '#ff3030'
  strength?: number;     // 0-1 signal strength, default 0.5
  /** Optional visual variant — e.g. 'pulse-slow' for deep mysterious contacts */
  style?: 'normal' | 'pulse-slow';
}

/** Side effects that fire when a step becomes active */
export type SideEffect =
  | { type: 'SPAWN_CONTACT'; contact: ContactDefinition }
  | { type: 'PLAY_TONE'; tone: string; loop?: boolean }
  | { type: 'SET_DEPTH_ZONE'; zone: string };

/** Triggers that can auto-confirm a role's task without manual button press */
export type AutoConfirmTrigger =
  | 'SONAR_PING'
  | 'FIRE_TORPEDO'
  | 'SET_HEADING'
  | 'SET_DEPTH'
  | 'SET_SPEED'
  | 'WEAPONS_LOCK';

export interface MissionStep {
  /** Stable id for this step (e.g. "s1", "s2") — used for confirmation tracking */
  id: string;
  /** Line the captain reads aloud — bold role names + numeric values are highlighted client-side */
  captainSay: string;
  /** Hint shown under the captain's line, e.g. "Wait for Sonar to press PING" */
  captainHint?: string;
  /** Map of role → task. Roles not in this map have no task this step. */
  crewTasks: Partial<Record<RoleKey, CrewTask>>;
  /** Roles whose confirmation is required to auto-advance. Empty = captain advances manually. */
  waitFor: RoleKey[];
  /** One-line summary shown when this step is marked done */
  doneText: string;
  /** Optional auto-confirmation hook — server marks the role done when the trigger action arrives */
  autoConfirmOn?: { role: RoleKey; trigger: AutoConfirmTrigger };
  /** Side effects that fire once when this step becomes active */
  sideEffects?: SideEffect[];
}

export interface MissionCompletionOverlay {
  title: string;          // e.g. "SIMULATION COMPLETE"
  glitch?: boolean;       // apply glitch effect to title
  body?: string;          // multi-line completion text
}

export interface MissionThread {
  /** Unique key, e.g. "M01", "M02", "MT0" */
  key: string;
  /** Short header label, e.g. "M01 · ALL HANDS" */
  badge: string;
  /** Full title, e.g. "ALL HANDS ON DECK" */
  name: string;
  /** Optional one-line briefing shown at mission start */
  brief?: string;
  /** Ordered list of steps */
  steps: MissionStep[];
  /** Optional handoff: when this mission completes, auto-start `nextMission` after `delayMs` */
  handoff?: {
    nextMission: string;                     // mission key, e.g. "M01"
    delayMs: number;                         // delay before auto-start
    completionOverlay?: MissionCompletionOverlay;
  };
}

/**
 * Registry of all missions. Keyed by mission key (M01, M02, MT0, etc.).
 * Empty until missions are populated in subsequent commits.
 */
export const MISSION_THREADS: Record<string, MissionThread> = {};
