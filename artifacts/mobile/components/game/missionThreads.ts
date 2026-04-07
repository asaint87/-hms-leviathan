// TODO: move to shared lib/missions package — currently duplicated
// from artifacts/api-server/src/missions/threads.ts
//
// Mission Thread Engine — schema and registry for HMS Leviathan missions.
// Modeled on the demo prototype's MISSION_THREADS object.
//
// The server is the source of truth for mission state. The full active
// mission thread is shipped to clients via the MISSION_ACTIVE message,
// so the client-side registry can stay empty — but the type definitions
// here are required for typing the message payloads.

export type RoleKey = 'c' | 'n' | 's' | 'e' | 'w';
export type Speed = 'STOP' | '1/3' | '2/3' | 'FULL';

/**
 * Optional state predicate for autoConfirmOn — confirms only if the room's
 * current game state matches when the trigger fires.
 */
export interface RequireState {
  heading?: { equals?: number; near?: number; tolerance?: number };
  depth?: { equals?: number; near?: number; tolerance?: number };
  speed?: Speed;
}

/** A single instruction shown on a crew member's task card */
export interface CrewTask {
  text: string;
  hint: string;
}

/** Definition for a contact to be spawned via SPAWN_CONTACT side effect */
export interface ContactDefinition {
  bearing: number;
  range: number;
  type: string;
  identified?: boolean;
  detected?: boolean;
  col?: string;
  strength?: number;
  style?: 'normal' | 'pulse-slow';
}

/** Side effects that fire when a step becomes active */
export type SideEffect =
  | { type: 'SPAWN_CONTACT'; contact: ContactDefinition }
  | { type: 'PLAY_TONE'; tone: string; loop?: boolean }
  | { type: 'SET_DEPTH_ZONE'; zone: string };

export type AutoConfirmTrigger =
  | 'SONAR_PING'
  | 'FIRE_TORPEDO'
  | 'SET_HEADING'
  | 'SET_DEPTH'
  | 'SET_SPEED'
  | 'WEAPONS_LOCK';

export interface MissionStep {
  id: string;
  captainSay: string;
  captainHint?: string;
  crewTasks: Partial<Record<RoleKey, CrewTask>>;
  waitFor: RoleKey[];
  doneText: string;
  autoConfirmOn?: {
    role: RoleKey;
    trigger: AutoConfirmTrigger;
    requireState?: RequireState;
  };
  sideEffects?: SideEffect[];
}

export interface MissionCompletionOverlay {
  title: string;
  glitch?: boolean;
  body?: string;
}

export interface MissionThread {
  key: string;
  badge: string;
  name: string;
  brief?: string;
  steps: MissionStep[];
  handoff?: {
    nextMission: string;
    delayMs: number;
    completionOverlay?: MissionCompletionOverlay;
  };
}

/**
 * Client-side registry. Authoritative data lives on the server and ships
 * via MISSION_ACTIVE — this empty registry is kept for type symmetry only.
 */
export const MISSION_THREADS: Record<string, MissionThread> = {};
