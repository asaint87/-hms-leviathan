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
  /**
   * If true, the engine will NOT auto-advance this step even when all
   * waitFor roles are confirmed. The captain must tap CONTINUE manually.
   * Use for dramatic beats where the captain needs to give a verbal order
   * before the system fires the next action (e.g. "Take the shot.").
   */
  requireCaptainAdvance?: boolean;
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
    brief: 'First patrol. Get every station online and confirmed.',
    steps: [
      {
        id: 's1',
        captainSay: '"All hands \u2014 report to stations. This is our first patrol."',
        captainHint: 'Wait for all four stations to confirm ready.',
        crewTasks: {
          s: { text: 'Report to Sonar station. Press READY.', hint: 'Say "Sonar \u2014 ready" to Captain.' },
          n: { text: 'Report to Navigator station. Press READY.', hint: 'Say "Navigator \u2014 ready" to Captain.' },
          w: { text: 'Report to Weapons station. Press READY.', hint: 'Say "Weapons \u2014 ready" to Captain.' },
          e: { text: 'Report to Engineer station. Press READY.', hint: 'Say "Engineer \u2014 ready" to Captain.' },
        },
        waitFor: ['s', 'n', 'w', 'e'],
        // No autoConfirmOn — the READY tap *is* the action; CREW_READY → confirmStep handles it.
        // missionStart tone fires here — M01 is reached only after MT0 hands off,
        // so this plays as the training simulation glitch overlay clears and the
        // real patrol begins. Semantic match for "missionStart".
        sideEffects: [
          { type: 'PLAY_TONE', tone: 'missionStart' },
        ],
        doneText: 'All stations confirmed ready.',
      },
      {
        id: 's2',
        captainSay: '"Sonar \u2014 ping the water. Tell me what\'s out there."',
        captainHint: 'Wait for Sonar to press PING.',
        crewTasks: {
          s: {
            text: 'Ping the water. Press PING on your sonar screen.',
            hint: 'Say "Sonar \u2014 contact bearing [what you see]" to Captain.',
          },
        },
        waitFor: ['s'],
        autoConfirmOn: { role: 's', trigger: 'SONAR_PING' },
        doneText: 'Sonar ping complete. Contacts updated.',
      },
      {
        id: 's3',
        captainSay: '"Navigator \u2014 come to heading North. Set speed Ahead One Third."',
        captainHint: 'Wait for Navigator to set heading and speed.',
        crewTasks: {
          n: {
            text: 'Set heading to 000\u00B0 North. Set throttle to AHEAD 1/3.',
            hint: 'Say "Navigator \u2014 heading North, speed Ahead One Third" to Captain.',
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
        doneText: 'Navigator on course. Speed set.',
      },
      {
        id: 's4',
        captainSay: '"Weapons \u2014 raise the periscope. Report what you see on the horizon."',
        captainHint: 'Wait for Weapons to open the periscope and report.',
        crewTasks: {
          w: {
            text: 'Open the periscope. Switch to STANDARD view. Scan the horizon.',
            hint: 'Say "Weapons \u2014 horizon clear" or report any contacts to Captain, then tap REPORT READY.',
          },
        },
        waitFor: ['w'],
        // Verbal confirmation — no autoConfirmOn. Weapons taps READY when done.
        doneText: 'Periscope raised. Horizon reported.',
      },
      {
        id: 's5',
        captainSay: '"Engineer \u2014 check all systems. Give me a full status report."',
        captainHint: 'Wait for Engineer to read the gauges and report.',
        crewTasks: {
          e: {
            text: 'Check your HULL gauge and all 5 SYSTEM panels. Check power levels.',
            hint: 'Say "Engineer \u2014 all systems green" or report any issues to Captain, then tap REPORT READY.',
          },
        },
        waitFor: ['e'],
        // Verbal confirmation — no autoConfirmOn. Engineer taps READY when done.
        doneText: 'Engineer systems check complete.',
      },
      {
        id: 's6',
        captainSay: '"All stations \u2014 this is HMS Leviathan. We are underway. Good hunting."',
        captainHint: 'No confirmations needed. This is the mission launch moment \u2014 tap CONTINUE.',
        crewTasks: {},
        waitFor: [],
        // Captain manually advances. End of mission.
        // (missionStart tone moved to s1 — fires when M01 begins, not ends.)
        doneText: 'Mission underway.',
      },
    ],
  },

  // =========================================================================
  // M02 — SEEK AND DESTROY
  // Hunt and eliminate the enemy contact in sector 4.
  // Builds on M01: same patterns, escalates to combat.
  // =========================================================================
  M02: {
    key: 'M02',
    badge: 'M02 \u00B7 SEEK & DESTROY',
    name: 'SEEK AND DESTROY',
    brief: 'Hunt and eliminate the enemy contact in sector 4.',
    steps: [
      {
        id: 's1',
        captainSay: '"All stations \u2014 we have an enemy contact in sector 4. Battle stations."',
        captainHint: 'Wait for all four stations to acknowledge battle stations.',
        crewTasks: {
          s: {
            text: 'Battle stations. Stay on your scope \u2014 we need that contact.',
            hint: 'Say "Sonar \u2014 battle stations" to Captain. Captain is about to order a ping.',
          },
          n: {
            text: 'Battle stations. Maintain current heading and depth.',
            hint: 'Say "Navigator \u2014 battle stations" to Captain. Wait for the next order.',
          },
          w: {
            text: 'Battle stations. Check tube count and report.',
            hint: 'Say "Weapons \u2014 [N] torpedoes loaded" to Captain.',
          },
          e: {
            text: 'Battle stations. Check hull and reactor. Keep cooling steady.',
            hint: 'Say "Engineer \u2014 battle stations, all green" to Captain.',
          },
        },
        waitFor: ['s', 'n', 'w', 'e'],
        // No autoConfirmOn — verbal acknowledgement, READY taps drive it.
        doneText: 'All stations at battle readiness.',
      },
      {
        id: 's2',
        captainSay: '"Sonar \u2014 ping the water. Find that contact. Tell me the bearing."',
        captainHint: 'Wait for Sonar to ping. Watch the radar for the contact to appear.',
        crewTasks: {
          s: {
            text: 'Press PING now. Find the contact. Read the bearing out loud.',
            hint: 'Example: "Sonar \u2014 contact bearing 034, 17 kilometers, close range."',
          },
        },
        waitFor: ['s'],
        autoConfirmOn: { role: 's', trigger: 'SONAR_PING' },
        doneText: 'Sonar detected and reported contact.',
      },
      {
        id: 's3',
        captainSay: '"Navigator \u2014 come to bearing 034. Ahead Two Thirds. Close the distance."',
        captainHint: 'Watch the radar \u2014 sub should start closing on the red contact.',
        crewTasks: {
          n: {
            text: 'Set heading to 034\u00B0. Throttle to AHEAD 2/3.',
            hint: 'Say "Navigator \u2014 on intercept course, ahead two thirds" to Captain.',
          },
        },
        waitFor: ['n'],
        // Auto-confirms only when speed is 2/3 AND heading is within 8° of 034.
        autoConfirmOn: {
          role: 'n',
          trigger: 'SET_SPEED',
          requireState: { speed: '2/3', heading: { near: 34, tolerance: 8 } },
        },
        doneText: 'Navigator on intercept course.',
      },
      {
        id: 's4',
        captainSay: '"Navigator \u2014 periscope depth. Take us up to 18 meters."',
        captainHint: 'Watch the depth indicator. It should drop to 18m.',
        crewTasks: {
          n: {
            text: 'Set depth to PERISCOPE \u2014 18 meters.',
            hint: 'Tap the PERISCOPE preset on your depth panel. Say "Navigator \u2014 at periscope depth" to Captain.',
          },
        },
        waitFor: ['n'],
        autoConfirmOn: {
          role: 'n',
          trigger: 'SET_DEPTH',
          requireState: { depth: { equals: 18 } },
        },
        doneText: 'At periscope depth.',
      },
      {
        id: 's5',
        captainSay: '"Weapons \u2014 raise the scope. Find TYPHOON-CLASS. Lock on. Do NOT fire yet."',
        captainHint: 'Wait for Weapons lock arc to complete. Then authorize fire next.',
        crewTasks: {
          w: {
            text: 'Switch to PERISCOPE mode. Tap the red TYPHOON-CLASS contact to lock. Do NOT fire \u2014 wait for Captain.',
            hint: 'When the lock arc completes, say "Weapons \u2014 locked on TYPHOON-CLASS" to Captain.',
          },
        },
        waitFor: ['w'],
        // Auto-confirms when the WeaponsStation lock-on animation completes
        // (~833ms after target tap) and the client sends LOCK_TARGET to server.
        autoConfirmOn: { role: 'w', trigger: 'WEAPONS_LOCK' },
        doneText: 'Weapons locked on target.',
      },
      {
        id: 's6',
        captainSay: '"All stations \u2014 stand by. Weapons \u2014 you are authorized to fire. Take the shot."',
        captainHint: 'Watch the periscope for torpedo impact.',
        crewTasks: {
          w: {
            text: 'Captain authorized fire. Press FIRE TORPEDO now.',
            hint: 'After firing, say "Weapons \u2014 torpedo away" to Captain.',
          },
        },
        waitFor: ['w'],
        autoConfirmOn: { role: 'w', trigger: 'FIRE_TORPEDO' },
        doneText: 'Torpedo fired on Captain\'s authorization.',
      },
    ],
  },

  // =========================================================================
  // MT0 — LEVIATHAN PROTOCOL · TRAINING EXERCISE 01
  // The training simulation that runs first when START_GAME fires.
  // 8 steps culminating in a torpedo hit, then a glitch-overlay handoff
  // reveals an unidentified deep signal and auto-starts M01.
  // =========================================================================
  MT0: {
    key: 'MT0',
    badge: 'MT0 \u00B7 TRAINING',
    name: 'LEVIATHAN PROTOCOL \u2014 TRAINING EXERCISE 01',
    brief:
      'Crew, this is a live simulation. Treat it as real. Track, identify, ' +
      'and neutralize a hostile submarine. You will rely on each other. ' +
      'Simulation begins now.',
    handoff: {
      nextMission: 'M01',
      delayMs: 8000,
      completionOverlay: {
        title: 'SIMULATION COMPLETE',
        glitch: true,
        body:
          'Target neutralized. Crew performance: Operational.\n\n' +
          'Systems review\u2026 interrupted.\n\n' +
          'Unidentified signal detected below test depth.\n\n' +
          'Source: Unknown\nClassification: Unresolved\n\n' +
          'This was not part of the simulation.\n\n' +
          'New mission parameters incoming\u2026\n\n' +
          'MISSION 01 UNLOCKED \u2014 SEA TRIALS\n\n' +
          'Your crew is ready. The ocean is not.',
      },
    },
    steps: [
      {
        id: 's1',
        captainSay: '"Sonar, find me something. We\'re blind without you."',
        captainHint: 'Wait for Sonar to ping the water.',
        crewTasks: {
          s: {
            text: 'The ocean is quiet. Ping the water \u2014 find the contact.',
            hint: 'Say "Sonar \u2014 contact bearing [number]" to Captain.',
          },
        },
        waitFor: ['s'],
        autoConfirmOn: { role: 's', trigger: 'SONAR_PING' },
        doneText: 'Contact acquired. Bearing confirmed.',
      },
      {
        id: 's2',
        captainSay: '"Navigator, plot intercept. Don\'t lose them."',
        captainHint: 'Wait for Navigator to set intercept heading and speed.',
        crewTasks: {
          n: {
            text: 'Target is moving. Come to bearing 034. Set speed Ahead 2/3.',
            hint: 'Say "Navigator \u2014 on intercept course" to Captain.',
          },
        },
        waitFor: ['n'],
        autoConfirmOn: {
          role: 'n',
          trigger: 'SET_SPEED',
          requireState: { speed: '2/3', heading: { near: 34, tolerance: 15 } },
        },
        doneText: 'Intercept course set. Closing distance.',
      },
      {
        id: 's3',
        captainSay: '"Engineer, I want speed and stealth. Make it work."',
        captainHint: 'Wait for Engineer to balance the power load.',
        crewTasks: {
          e: {
            text: 'Propulsion, sonar, and cooling are all demanding power. Balance them. Don\'t let anything overheat.',
            hint: 'Say "Engineer \u2014 systems balanced" to Captain.',
          },
        },
        waitFor: ['e'],
        // Verbal confirmation — no autoConfirmOn. Engineer taps READY.
        doneText: 'Power balanced. Running hot but stable.',
      },
      {
        id: 's4',
        captainSay: '"Sonar, confirm target. Navigator, hold us steady."',
        captainHint: 'Sonar must reacquire the contact. Navigator holds position.',
        crewTasks: {
          s: {
            text: 'Target is evading. Ping again \u2014 reacquire the contact.',
            hint: 'Say "Sonar \u2014 contact reacquired" to Captain.',
          },
          n: {
            text: 'Hold our position. Don\'t let us drift.',
            hint: 'Say "Navigator \u2014 holding steady" to Captain, then tap REPORT READY.',
          },
        },
        waitFor: ['s', 'n'],
        // Sonar auto-confirms via PING. Navigator manually taps READY (verbal hold).
        autoConfirmOn: { role: 's', trigger: 'SONAR_PING' },
        doneText: 'Target reacquired. Holding position.',
      },
      {
        id: 's5',
        captainSay: '"Weapons, stand by. I want a clean shot."',
        captainHint: 'Wait for Weapons to lock the target.',
        crewTasks: {
          w: {
            text: 'Target is in range but moving. Lock on. Do not fire \u2014 wait for Captain.',
            hint: 'Say "Weapons \u2014 locked on target" to Captain.',
          },
        },
        waitFor: ['w'],
        autoConfirmOn: { role: 'w', trigger: 'WEAPONS_LOCK' },
        doneText: 'Target locked. Awaiting fire order.',
      },
      {
        id: 's6',
        captainSay: '"All stations report. We take the shot on my mark."',
        captainHint: 'When all 4 crew are READY, tap CONTINUE to give the fire order.',
        crewTasks: {
          s: { text: 'Report status to Captain. Tap READY.', hint: 'Say "Sonar \u2014 ready" to Captain.' },
          n: { text: 'Report status to Captain. Tap READY.', hint: 'Say "Navigator \u2014 ready" to Captain.' },
          e: { text: 'Report status to Captain. Tap READY.', hint: 'Say "Engineer \u2014 ready" to Captain.' },
          w: { text: 'All stations reporting. Stay locked. Tap READY.', hint: 'Say "Weapons \u2014 ready, target locked" to Captain.' },
        },
        waitFor: ['s', 'n', 'e', 'w'],
        // Captain owns the dramatic beat. Engine waits for manual CONTINUE
        // even after all 4 crew confirm. The captain says "Fire" out loud
        // on the next step.
        requireCaptainAdvance: true,
        doneText: 'All stations ready. Fire order incoming.',
      },
      {
        id: 's7',
        captainSay: '"Fire."',
        captainHint: 'Weapons executes. Watch for impact.',
        crewTasks: {
          w: {
            text: 'Captain authorized fire. Press FIRE TORPEDO now.',
            hint: 'Say "Torpedo away" to Captain.',
          },
        },
        waitFor: ['w'],
        autoConfirmOn: { role: 'w', trigger: 'FIRE_TORPEDO' },
        doneText: 'Torpedo away. Tracking impact.',
      },
      {
        id: 's8',
        captainSay: '"\u2026Sonar, report."',
        captainHint: 'Something is wrong. Wait for Sonar to lock the new signal.',
        crewTasks: {
          s: {
            text: 'Something is on your screen. It wasn\'t there before. Align the frequency \u2014 lock it if you can.',
            hint: 'Say "Captain\u2026 I\'m reading something. It\'s not debris." to Captain.',
          },
        },
        waitFor: ['s'],
        autoConfirmOn: { role: 's', trigger: 'SONAR_PING' },
        sideEffects: [
          {
            type: 'SPAWN_CONTACT',
            contact: {
              bearing: 180,
              range: 0.95,
              identified: false,
              type: 'UNKNOWN \u2014 DEEP SIGNAL',
              col: '#00e5cc',
              style: 'pulse-slow',
              strength: 0.3,
            },
          },
          { type: 'PLAY_TONE', tone: 'abyssalPulse', loop: true },
        ],
        doneText: 'Signal acquired. Source unknown.',
      },
    ],
  },
};
