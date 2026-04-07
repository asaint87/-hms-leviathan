// TODO: move to shared lib/missions package — currently duplicated
// in artifacts/mobile/components/game/missionThreads.ts
//
// Mission Thread Engine — schema and registry for HMS Leviathan missions.
// Modeled on the demo prototype's MISSION_THREADS object.

export type RoleKey = 'c' | 'n' | 's' | 'e' | 'w';
export type Speed = 'STOP' | '1/3' | '2/3' | 'FULL';

/**
 * Optional state predicate for autoConfirmOn — confirms only if the room's
 * current game state matches when the trigger fires. Used to disambiguate
 * multi-action steps (e.g. "set heading north AND speed 1/3") and to debounce
 * triggers that fire continuously like SET_HEADING during dial drag.
 */
export interface RequireState {
  heading?: { equals?: number; near?: number; tolerance?: number };
  depth?: { equals?: number; near?: number; tolerance?: number };
  speed?: Speed;
}

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
  /**
   * Optional auto-confirmation hook — server marks the role done when the
   * trigger action arrives. If `requireState` is set, the confirmation only
   * fires if the room's current game state matches the predicate.
   */
  autoConfirmOn?: {
    role: RoleKey;
    trigger: AutoConfirmTrigger;
    requireState?: RequireState;
  };
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
 * Ported from the demo prototype's MISSION_THREADS object — single-char
 * role keys, exact step structure preserved.
 */
export const MISSION_THREADS: Record<string, MissionThread> = {
  // =========================================================================
  // M01 — ALL HANDS ON DECK
  // First patrol. Orient the crew to their stations.
  // Each crew action is auto-confirmed where a clean in-game trigger exists;
  // verbal confirmations rely on the REPORT READY button or captain advance.
  // =========================================================================
  M01: {
    key: 'M01',
    badge: 'M01 \u00B7 ALL HANDS',
    name: 'ALL HANDS ON DECK',
    brief: 'First patrol \u2014 orient the crew to their stations.',
    steps: [
      {
        id: 's1',
        captainSay: '"All hands \u2014 report to stations. This is our first patrol."',
        captainHint: 'Wait for each crew member to tap REPORT READY.',
        crewTasks: {
          s: { text: 'Report to your station.', hint: 'Tap REPORT READY to signal Captain you are ready.' },
          n: { text: 'Report to your station.', hint: 'Tap REPORT READY to signal Captain you are ready.' },
          w: { text: 'Report to your station.', hint: 'Tap REPORT READY to signal Captain you are ready.' },
          e: { text: 'Report to your station.', hint: 'Tap REPORT READY to signal Captain you are ready.' },
        },
        waitFor: ['s', 'n', 'w', 'e'],
        // No autoConfirmOn — the READY tap *is* the action; CREW_READY → confirmStep handles it.
        doneText: 'All stations reporting in.',
      },
      {
        id: 's2',
        captainSay: '"Sonar \u2014 ping the water. Let\'s find out what\'s out there."',
        captainHint: 'Wait for Sonar to press the PING button.',
        crewTasks: {
          s: { text: 'Press the PING button now.', hint: 'Tell the Captain how many contacts you see.' },
        },
        waitFor: ['s'],
        autoConfirmOn: { role: 's', trigger: 'SONAR_PING' },
        doneText: 'Sonar completed first ping.',
      },
      {
        id: 's3',
        captainSay: '"Navigator \u2014 come to heading North. Set speed Ahead 1/3."',
        captainHint: 'Watch the heading display and speed buttons on Navigator.',
        crewTasks: {
          n: {
            text: 'Set heading to NORTH (000\u00B0). Set throttle to AHEAD 1/3.',
            hint: 'Use the compass dial to find North, then tap 1/3 on the speed control.',
          },
        },
        waitFor: ['n'],
        // Auto-confirms only when speed is 1/3 AND heading is within 15° of North.
        // Trigger fires on SET_SPEED — the deliberate tap, not the continuous heading drag.
        autoConfirmOn: {
          role: 'n',
          trigger: 'SET_SPEED',
          requireState: { speed: '1/3', heading: { near: 0, tolerance: 15 } },
        },
        doneText: 'Navigator set heading and speed.',
      },
      {
        id: 's4',
        captainSay: '"Weapons \u2014 raise the periscope. Report what you see on the horizon."',
        captainHint: 'Switch to Weapons tab to see their scope if needed.',
        crewTasks: {
          w: {
            text: 'Switch to PERISCOPE view. Describe what you see. Report to Captain.',
            hint: 'Say "All clear" or describe any ships you see, then tap REPORT READY.',
          },
        },
        waitFor: ['w'],
        // Verbal confirmation — no autoConfirmOn. Weapons taps READY when done.
        doneText: 'Weapons reported horizon status.',
      },
      {
        id: 's5',
        captainSay: '"Engineer \u2014 check all systems. Give me a status report."',
        captainHint: 'Engineer will read the system panels and hull gauge.',
        crewTasks: {
          e: {
            text: 'Check your HULL gauge and all 5 SYSTEM panels. Report any problems to Captain.',
            hint: 'Say "Hull is good" and name any systems that are not ONLINE, then tap REPORT READY.',
          },
        },
        waitFor: ['e'],
        // Verbal confirmation — no autoConfirmOn. Engineer taps READY when done.
        doneText: 'Engineer gave system status.',
      },
      {
        id: 's6',
        captainSay: '"All stations \u2014 this is HMS Leviathan. We are underway. Good hunting."',
        captainHint: 'Mission complete \u2014 tap CONTINUE to finish.',
        crewTasks: {},
        waitFor: [],
        // Captain manually advances. End of mission.
        doneText: 'Mission 01 complete. Crew oriented.',
      },
    ],
  },
};
