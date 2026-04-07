import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage, Server } from 'http';
import {
  MISSION_THREADS,
  MissionThread,
  MissionStep,
  SideEffect,
  AutoConfirmTrigger,
  RequireState,
} from './missions/threads';

type RoleKey = 'c' | 'n' | 's' | 'e' | 'w';
type Speed = 'STOP' | '1/3' | '2/3' | 'FULL';

interface SystemStatus {
  id: string;
  name: string;
  status: 'ONLINE' | 'DEGRADED' | 'OFFLINE';
}

interface Enemy {
  id: number;
  bearing: number;
  range: number;
  type: string;
  identified: boolean;
  detected: boolean;
  destroyed: boolean;
  col: string;
  strength: number;
  /** Optional visual variant — e.g. 'pulse-slow' for deep mysterious contacts */
  style?: 'normal' | 'pulse-slow';
}

interface GameState {
  hull: number;
  torps: number;
  torpReserve: number;
  heading: number;
  depth: number;
  speed: Speed;
  reactorTemp: number;
  coolingRods: number;
  power: number;
  systems: SystemStatus[];
  enemies: Enemy[];
  crisisId: string | null;
  missionId: string;
  missionStep: number;
  subMapX: number;
  subMapY: number;
}

interface Player {
  ws: WebSocket;
  name: string;
  role: RoleKey;
  avatar?: string;
}

interface Room {
  code: string;
  players: Map<string, Player>;
  gameState: GameState;
  phase: 'LOBBY' | 'PLAYING' | 'COMPLETE';
  gameLoop: ReturnType<typeof setInterval> | null;
  crewReady: Set<RoleKey>; // legacy fallback — confirmations for the current step
  // Mission Thread Engine state:
  activeMissionKey: string | null;
  activeStepIdx: number;
  /** stepId -> set of roles that have confirmed that step */
  stepConfirmations: Map<string, Set<RoleKey>>;
  /** Pending mission handoff timer (auto-start next mission after delay) */
  handoffTimer: ReturnType<typeof setTimeout> | null;
  /** Tones currently playing on a loop, started by side effects */
  activeLoopedTones: Set<string>;
}

const rooms = new Map<string, Room>();
const socketToRoom = new Map<WebSocket, string>();
const socketToPlayerId = new Map<WebSocket, string>();

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  if (rooms.has(code)) return generateCode();
  return code;
}

function createInitialGameState(): GameState {
  return {
    hull: 100,
    torps: 4,
    torpReserve: 2,
    heading: 0,
    depth: 142,
    speed: 'STOP',
    reactorTemp: 280,
    coolingRods: 50,
    power: 85,
    systems: [
      { id: 'propulsion', name: 'PROPULSION', status: 'ONLINE' },
      { id: 'weapons', name: 'WEAPONS SYS', status: 'ONLINE' },
      { id: 'sonar', name: 'SONAR ARRAY', status: 'ONLINE' },
      { id: 'comms', name: 'COMMS', status: 'ONLINE' },
      { id: 'life_support', name: 'LIFE SUPPORT', status: 'ONLINE' },
    ],
    enemies: [
      {
        id: 1,
        bearing: 34,
        range: 0.28,
        type: 'TYPHOON-CLASS',
        identified: false,
        detected: false,
        destroyed: false,
        col: '#ff3030',
        strength: 0,
      },
      {
        id: 2,
        bearing: 210,
        range: 0.55,
        type: 'DESTROYER',
        identified: false,
        detected: false,
        destroyed: false,
        col: '#ff8c00',
        strength: 0,
      },
    ],
    crisisId: null,
    missionId: 'M01',
    missionStep: 0,
    subMapX: 0.5,
    subMapY: 0.5,
  };
}

function broadcastToRoom(room: Room, message: object) {
  const data = JSON.stringify(message);
  room.players.forEach((player) => {
    if (player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(data);
    }
  });
}

function broadcastGameState(room: Room) {
  // Send player names/roles but NOT avatars — avatars are large base64 blobs
  // that only need to be sent once via PLAYER_LIST, not every 500ms tick
  // Mission engine state is included so reconnecting clients can recover.
  const stepConfirmations: Record<string, RoleKey[]> = {};
  for (const [stepId, roles] of room.stepConfirmations) {
    stepConfirmations[stepId] = Array.from(roles);
  }
  broadcastToRoom(room, {
    type: 'GAME_STATE',
    state: room.gameState,
    players: Array.from(room.players.values()).map((p) => ({
      name: p.name,
      role: p.role,
    })),
    crewReady: Array.from(room.crewReady),
    activeMissionKey: room.activeMissionKey,
    activeStepIdx: room.activeStepIdx,
    stepConfirmations,
  });
}

function broadcastPlayerList(room: Room) {
  broadcastToRoom(room, {
    type: 'PLAYER_LIST',
    players: Array.from(room.players.values()).map((p) => ({
      name: p.name,
      role: p.role,
      avatar: p.avatar,
    })),
  });
}

function actionLog(
  room: Room,
  text: string,
  kind: 'info' | 'kill' | 'warn' | 'crit' = 'info'
) {
  broadcastToRoom(room, { type: 'ACTION_LOG', text, kind });
}

function startGameLoop(room: Room) {
  if (room.gameLoop) return;
  room.gameLoop = setInterval(() => {
    const gs = room.gameState;

    const speedMultiplier: Record<Speed, number> = {
      STOP: 0.2,
      '1/3': 0.4,
      '2/3': 0.7,
      FULL: 1.0,
    };
    const reactorLoad = speedMultiplier[gs.speed] * 100;
    const coolingEffect = gs.coolingRods * 1.5;
    const tempDelta = (reactorLoad - coolingEffect) * 0.025;
    gs.reactorTemp = Math.max(180, Math.min(500, gs.reactorTemp + tempDelta));

    if (gs.reactorTemp >= 450 && !gs.crisisId) {
      gs.crisisId = 'REACTOR_MELTDOWN';
      broadcastToRoom(room, {
        type: 'CRISIS_START',
        crisisId: 'REACTOR_MELTDOWN',
        def: {
          title: 'REACTOR MELTDOWN',
          description: 'Reactor temperature critical! Insert cooling rods to 95%+',
        },
      });
      actionLog(room, 'CRISIS: REACTOR MELTDOWN — temperature critical!', 'crit');
    } else if (gs.crisisId === 'REACTOR_MELTDOWN' && gs.reactorTemp < 400) {
      gs.crisisId = null;
      broadcastToRoom(room, { type: 'CRISIS_RESOLVE' });
      actionLog(room, 'CRISIS RESOLVED — reactor temperature stable.', 'info');
    }

    if (gs.reactorTemp >= 450) {
      gs.hull = Math.max(0, gs.hull - 0.3);
    }

    const speedKnots: Record<Speed, number> = { STOP: 0, '1/3': 5, '2/3': 12, FULL: 20 };
    const knots = speedKnots[gs.speed];
    if (knots > 0) {
      const headingRad = (gs.heading * Math.PI) / 180;
      gs.subMapX = Math.max(0.05, Math.min(0.95, gs.subMapX + Math.sin(headingRad) * knots * 0.0000015));
      gs.subMapY = Math.max(0.05, Math.min(0.95, gs.subMapY - Math.cos(headingRad) * knots * 0.0000015));
    }

    gs.enemies.forEach((enemy) => {
      if (!enemy.destroyed) {
        enemy.bearing = ((enemy.bearing + (Math.random() - 0.5) * 0.4) + 360) % 360;
        enemy.range = Math.max(0.05, Math.min(0.95, enemy.range + (Math.random() - 0.5) * 0.001));
      }
    });

    const aliveEnemies = gs.enemies.filter((e) => !e.destroyed);
    if (aliveEnemies.length === 0 && room.phase === 'PLAYING') {
      room.phase = 'COMPLETE';
      broadcastToRoom(room, {
        type: 'MISSION_COMPLETE',
        missionId: gs.missionId,
        xp: { c: 150, n: 100, s: 100, e: 100, w: 150 },
      });
      stopGameLoop(room);
    }

    if (gs.hull <= 0 && room.phase === 'PLAYING') {
      room.phase = 'COMPLETE';
      broadcastToRoom(room, { type: 'GAME_OVER', reason: 'Hull integrity lost — all hands lost.' });
      stopGameLoop(room);
    }

    broadcastGameState(room);
  }, 500);
}

function stopGameLoop(room: Room) {
  if (room.gameLoop) {
    clearInterval(room.gameLoop);
    room.gameLoop = null;
  }
}

// =========================================================
// MISSION THREAD ENGINE
// =========================================================

function getActiveThread(room: Room): MissionThread | null {
  if (!room.activeMissionKey) return null;
  return MISSION_THREADS[room.activeMissionKey] ?? null;
}

function getCurrentStep(room: Room): MissionStep | null {
  const thread = getActiveThread(room);
  if (!thread) return null;
  return thread.steps[room.activeStepIdx] ?? null;
}

/** Stop all looped tones started by previous steps */
function clearLoopedTones(room: Room) {
  for (const tone of room.activeLoopedTones) {
    broadcastToRoom(room, { type: 'STOP_TONE', tone });
  }
  room.activeLoopedTones.clear();
}

/** Apply a step's side effects: spawn contacts, start tones, etc. */
function applyStepSideEffects(room: Room, step: MissionStep) {
  if (!step.sideEffects) return;
  for (const effect of step.sideEffects) {
    switch (effect.type) {
      case 'SPAWN_CONTACT': {
        const c = effect.contact;
        const nextId =
          room.gameState.enemies.reduce((max, e) => Math.max(max, e.id), 0) + 1;
        room.gameState.enemies.push({
          id: nextId,
          bearing: c.bearing,
          range: c.range,
          type: c.type,
          identified: c.identified ?? false,
          detected: c.detected ?? false,
          destroyed: false,
          col: c.col ?? '#ff3030',
          strength: c.strength ?? 0.5,
          style: c.style ?? 'normal',
        });
        actionLog(room, `New contact detected: ${c.type}`, 'warn');
        break;
      }
      case 'PLAY_TONE': {
        if (effect.loop) room.activeLoopedTones.add(effect.tone);
        broadcastToRoom(room, {
          type: 'PLAY_TONE',
          tone: effect.tone,
          loop: !!effect.loop,
        });
        break;
      }
      case 'SET_DEPTH_ZONE': {
        // Reserved for future depth zone mechanics
        break;
      }
    }
  }
}

/** Initialize a mission thread on a room. Resets step state and broadcasts. */
function initMission(room: Room, missionKey: string) {
  const thread = MISSION_THREADS[missionKey];
  if (!thread) {
    actionLog(room, `[engine] Unknown mission key: ${missionKey}`, 'crit');
    return;
  }

  // Cancel any pending handoff and stop looped tones from previous mission
  if (room.handoffTimer) {
    clearTimeout(room.handoffTimer);
    room.handoffTimer = null;
  }
  clearLoopedTones(room);

  room.activeMissionKey = missionKey;
  room.activeStepIdx = 0;
  room.stepConfirmations.clear();
  room.crewReady.clear();
  room.gameState.missionId = missionKey;
  room.gameState.missionStep = 0;

  broadcastToRoom(room, { type: 'MISSION_ACTIVE', thread, stepIdx: 0 });
  actionLog(room, `MISSION THREAD: ${thread.name} — Step 1 active`, 'info');

  // Apply side effects of the first step
  const firstStep = thread.steps[0];
  if (firstStep) applyStepSideEffects(room, firstStep);

  broadcastGameState(room);
}

/** Advance to the next step or complete the mission. */
function advanceStep(room: Room) {
  const thread = getActiveThread(room);
  if (!thread) return;

  // Stop any looped tones from the step we're leaving
  clearLoopedTones(room);

  const nextIdx = room.activeStepIdx + 1;
  if (nextIdx >= thread.steps.length) {
    completeMission(room);
    return;
  }

  room.activeStepIdx = nextIdx;
  room.gameState.missionStep = nextIdx;
  room.crewReady.clear();

  broadcastToRoom(room, {
    type: 'MISSION_STEP_ADVANCE',
    stepIdx: nextIdx,
    stepId: thread.steps[nextIdx].id,
  });
  // Backwards-compat broadcast for clients still listening to MISSION_STEP
  broadcastToRoom(room, { type: 'MISSION_STEP', missionStep: nextIdx });
  actionLog(
    room,
    `Thread step ${nextIdx + 1}: ${thread.steps[nextIdx].doneText || ''}`,
    'info'
  );

  applyStepSideEffects(room, thread.steps[nextIdx]);
  broadcastGameState(room);
}

/** Complete the active mission. Triggers handoff if defined. */
function completeMission(room: Room) {
  const thread = getActiveThread(room);
  if (!thread) return;

  clearLoopedTones(room);
  actionLog(room, `MISSION ${thread.name} — ALL STEPS COMPLETE`, 'kill');

  if (thread.handoff) {
    const { nextMission, delayMs, completionOverlay } = thread.handoff;
    broadcastToRoom(room, {
      type: 'MISSION_COMPLETE_OVERLAY',
      title: completionOverlay?.title ?? 'MISSION COMPLETE',
      glitch: completionOverlay?.glitch ?? false,
      body: completionOverlay?.body ?? '',
      nextMissionKey: nextMission,
      delayMs,
    });
    if (room.handoffTimer) clearTimeout(room.handoffTimer);
    room.handoffTimer = setTimeout(() => {
      room.handoffTimer = null;
      initMission(room, nextMission);
    }, delayMs);
  } else {
    // No handoff — fall through to existing MISSION_COMPLETE end-game flow
    broadcastToRoom(room, {
      type: 'MISSION_COMPLETE',
      missionId: thread.key,
    });
  }
}

/** Mark a role as having confirmed the current step. Returns true if step advanced. */
function confirmStep(room: Room, role: RoleKey): boolean {
  const thread = getActiveThread(room);
  const step = getCurrentStep(room);
  if (!thread || !step) return false;

  let confirmed = room.stepConfirmations.get(step.id);
  if (!confirmed) {
    confirmed = new Set();
    room.stepConfirmations.set(step.id, confirmed);
  }
  confirmed.add(role);
  // Mirror to legacy crewReady so older clients still see pills update
  room.crewReady.add(role);

  // Check if all required roles are confirmed
  const allDone =
    step.waitFor.length > 0 && step.waitFor.every((r) => confirmed!.has(r));

  broadcastGameState(room);

  // If the step requires captain manual advance, do not auto-advance even
  // when all crew confirmations are in. The captain owns the dramatic beat.
  if (allDone && !step.requireCaptainAdvance) {
    setTimeout(() => advanceStep(room), 600);
    return true;
  }
  return false;
}

/**
 * Check a requireState predicate against the current room game state.
 * Heading checks are wraparound-aware (350° vs 5° = 15° apart).
 * Default tolerance is 5 if unspecified for `near` predicates.
 */
function checkRequireState(gs: GameState, req: RequireState): boolean {
  if (req.speed !== undefined && gs.speed !== req.speed) return false;

  if (req.heading) {
    const h = req.heading;
    if (h.equals !== undefined && Math.round(gs.heading) !== h.equals) return false;
    if (h.near !== undefined) {
      const tol = h.tolerance ?? 5;
      // Wraparound-aware angular distance
      const diff = Math.abs(((gs.heading - h.near + 540) % 360) - 180);
      if (diff > tol) return false;
    }
  }

  if (req.depth) {
    const d = req.depth;
    if (d.equals !== undefined && gs.depth !== d.equals) return false;
    if (d.near !== undefined) {
      const tol = d.tolerance ?? 5;
      if (Math.abs(gs.depth - d.near) > tol) return false;
    }
  }

  return true;
}

/** Check the current step's autoConfirmOn hook against an incoming action trigger. */
function tryAutoConfirm(room: Room, trigger: AutoConfirmTrigger) {
  const step = getCurrentStep(room);
  if (!step?.autoConfirmOn) return;
  if (step.autoConfirmOn.trigger !== trigger) return;
  // If a state predicate is set, only confirm when the predicate matches.
  if (step.autoConfirmOn.requireState) {
    if (!checkRequireState(room.gameState, step.autoConfirmOn.requireState)) return;
  }
  confirmStep(room, step.autoConfirmOn.role);
}

function handleMessage(ws: WebSocket, message: string) {
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(message);
  } catch {
    return;
  }

  const roomCode = socketToRoom.get(ws);
  const room = roomCode ? rooms.get(roomCode) : undefined;

  switch (msg['type']) {
    case 'CREATE_ROOM': {
      const code = generateCode();
      const newRoom: Room = {
        code,
        players: new Map(),
        gameState: createInitialGameState(),
        phase: 'LOBBY',
        gameLoop: null,
        crewReady: new Set(),
        activeMissionKey: null,
        activeStepIdx: 0,
        stepConfirmations: new Map(),
        handoffTimer: null,
        activeLoopedTones: new Set(),
      };
      const playerId = `${Date.now()}-${Math.random()}`;
      newRoom.players.set(playerId, {
        ws,
        name: String(msg['name'] || 'UNKNOWN'),
        role: (msg['role'] as RoleKey) || 'c',
        avatar: msg['avatar'] ? String(msg['avatar']) : undefined,
      });
      rooms.set(code, newRoom);
      socketToRoom.set(ws, code);
      socketToPlayerId.set(ws, playerId);
      ws.send(JSON.stringify({ type: 'ROOM_CREATED', code }));
      broadcastPlayerList(newRoom);
      break;
    }

    case 'JOIN_ROOM': {
      const joinRoom = rooms.get(String(msg['code'] || ''));
      if (!joinRoom) {
        ws.send(JSON.stringify({ type: 'ERROR', message: 'Room not found. Check the code.' }));
        return;
      }
      if (joinRoom.phase === 'COMPLETE') {
        ws.send(JSON.stringify({ type: 'ERROR', message: 'Game already complete.' }));
        return;
      }
      const playerId = `${Date.now()}-${Math.random()}`;
      joinRoom.players.set(playerId, {
        ws,
        name: String(msg['name'] || 'UNKNOWN'),
        role: (msg['role'] as RoleKey) || 'c',
        avatar: msg['avatar'] ? String(msg['avatar']) : undefined,
      });
      socketToRoom.set(ws, String(msg['code']));
      socketToPlayerId.set(ws, playerId);
      ws.send(JSON.stringify({ type: 'ROOM_JOINED', code: msg['code'] }));
      if (joinRoom.phase === 'PLAYING') {
        broadcastGameState(joinRoom);
        ws.send(JSON.stringify({ type: 'GAME_START' }));
      } else {
        broadcastPlayerList(joinRoom);
      }
      break;
    }

    case 'START_GAME': {
      if (!room || room.phase !== 'LOBBY') return;
      room.phase = 'PLAYING';
      room.crewReady.clear();
      broadcastToRoom(room, { type: 'GAME_START' });
      broadcastGameState(room);
      startGameLoop(room);
      actionLog(room, 'HMS Leviathan is underway. Battle stations.', 'info');
      // Auto-initialize the training simulation. MT0 hands off to M01.
      if (MISSION_THREADS['MT0']) {
        initMission(room, 'MT0');
      } else if (MISSION_THREADS['M01']) {
        // Fallback if MT0 is not in the registry for some reason
        initMission(room, 'M01');
      }
      break;
    }

    case 'LEAVE_GAME': {
      handleDisconnect(ws);
      break;
    }

    case 'SONAR_PING': {
      if (!room) return;
      const gs = room.gameState;
      gs.enemies.forEach((enemy) => {
        if (!enemy.destroyed) {
          enemy.detected = true;
          enemy.strength = Math.max(0.3, 1 - enemy.range * 0.7);
          if (enemy.range < 0.15) {
            enemy.identified = true;
          }
        }
      });
      const detected = gs.enemies.filter((e) => e.detected && !e.destroyed).length;
      broadcastGameState(room);
      actionLog(room, `Sonar PING — ${detected} contact${detected !== 1 ? 's' : ''} detected.`, 'info');
      tryAutoConfirm(room, 'SONAR_PING');
      break;
    }

    case 'SET_HEADING': {
      if (!room) return;
      let h = Math.round(Number(msg['heading'])) % 360;
      if (h < 0) h += 360;
      room.gameState.heading = h;
      broadcastGameState(room);
      tryAutoConfirm(room, 'SET_HEADING');
      break;
    }

    case 'SET_DEPTH': {
      if (!room) return;
      room.gameState.depth = Math.max(18, Math.min(300, Number(msg['depth'])));
      broadcastGameState(room);
      tryAutoConfirm(room, 'SET_DEPTH');
      break;
    }

    case 'SET_SPEED': {
      if (!room) return;
      const validSpeeds: Speed[] = ['STOP', '1/3', '2/3', 'FULL'];
      const spd = msg['speed'] as Speed;
      if (validSpeeds.includes(spd)) {
        room.gameState.speed = spd;
        broadcastGameState(room);
        actionLog(room, `Navigator — Speed set to ${spd}.`, 'info');
        tryAutoConfirm(room, 'SET_SPEED');
      }
      break;
    }

    case 'LOCK_TARGET': {
      if (!room) return;
      // Lock-on is currently a client-side cosmetic; the server uses this
      // message only as a mission engine trigger. targetId is included in
      // the message for forward compatibility (a future requireState
      // predicate could match on locked target type or id) but is unused
      // here. No game state mutation.
      tryAutoConfirm(room, 'WEAPONS_LOCK');
      break;
    }

    case 'FIRE_TORPEDO': {
      if (!room) return;
      const gs = room.gameState;
      if (gs.torps <= 0) {
        ws.send(JSON.stringify({ type: 'ERROR', message: 'No torpedoes loaded.' }));
        return;
      }
      gs.torps--;
      const target = gs.enemies.find((e) => e.id === Number(msg['targetId']) && !e.destroyed);
      if (target) {
        const hitChance = Math.max(0.45, 0.93 - target.range * 0.65);
        const hit = Math.random() < hitChance;
        if (hit) {
          target.destroyed = true;
          broadcastToRoom(room, {
            type: 'TORPEDO_HIT',
            targetId: target.id,
            targetBearing: target.bearing,
            targetRange: target.range,
            targetType: target.type,
          });
          actionLog(room, `TORPEDO HIT — ${target.type} DESTROYED`, 'kill');
        } else {
          broadcastToRoom(room, {
            type: 'TORPEDO_MISS',
            targetId: target.id,
            targetBearing: target.bearing,
            targetRange: target.range,
          });
          actionLog(room, 'TORPEDO MISS — target evaded.', 'warn');
        }
      } else {
        broadcastToRoom(room, { type: 'TORPEDO_MISS' });
        actionLog(room, 'TORPEDO MISS — no valid target.', 'warn');
      }
      broadcastGameState(room);
      tryAutoConfirm(room, 'FIRE_TORPEDO');
      break;
    }

    case 'REPAIR_HULL': {
      if (!room) return;
      actionLog(room, 'Engineer — Hull repair sequence started...', 'info');
      setTimeout(() => {
        if (!room || room.phase !== 'PLAYING') return;
        room.gameState.hull = Math.min(100, room.gameState.hull + 15);
        broadcastGameState(room);
        actionLog(room, 'Engineer — Hull repair complete. +15% integrity.', 'info');
      }, 3000);
      break;
    }

    case 'REARM_TORPS': {
      if (!room) return;
      const gs = room.gameState;
      if (gs.torpReserve <= 0) {
        ws.send(JSON.stringify({ type: 'ERROR', message: 'No reserve torpedoes.' }));
        return;
      }
      const toLoad = Math.min(gs.torpReserve, 6 - gs.torps);
      if (toLoad === 0) {
        ws.send(JSON.stringify({ type: 'ERROR', message: 'All tubes already loaded.' }));
        return;
      }
      gs.torpReserve -= toLoad;
      gs.torps += toLoad;
      broadcastGameState(room);
      actionLog(room, `Engineer — Torpedoes rearmed. ${gs.torps} tubes loaded.`, 'info');
      break;
    }

    case 'SET_COOLING': {
      if (!room) return;
      room.gameState.coolingRods = Math.max(0, Math.min(100, Number(msg['level'])));
      broadcastGameState(room);
      break;
    }

    case 'CREW_READY': {
      if (!room) return;
      const playerId = socketToPlayerId.get(ws);
      if (!playerId) return;
      const player = room.players.get(playerId);
      if (!player) return;

      actionLog(
        room,
        `${player.name} (${player.role.toUpperCase()}) reports READY.`,
        'info'
      );

      // If a mission thread is active, use the engine.
      if (getActiveThread(room)) {
        confirmStep(room, player.role);
        break;
      }

      // Legacy fallback: no active thread — use old "all roles ready" behavior
      room.crewReady.add(player.role);
      const presentRoles = new Set(
        Array.from(room.players.values()).map((p) => p.role)
      );
      const allReady = Array.from(presentRoles).every((r) =>
        room.crewReady.has(r)
      );
      if (allReady && presentRoles.size > 0) {
        room.gameState.missionStep++;
        room.crewReady.clear();
        broadcastToRoom(room, {
          type: 'MISSION_STEP',
          missionStep: room.gameState.missionStep,
        });
      }
      broadcastGameState(room);
      break;
    }

    case 'START_MISSION': {
      if (!room) return;
      const playerId = socketToPlayerId.get(ws);
      const player = playerId ? room.players.get(playerId) : undefined;
      // Captain-only — non-captains are silently ignored
      if (!player || player.role !== 'c') return;
      const key = String(msg['missionKey'] || '');
      if (!key) return;
      initMission(room, key);
      break;
    }

    case 'CAPTAIN_ADVANCE_STEP': {
      if (!room) return;
      const playerId = socketToPlayerId.get(ws);
      const player = playerId ? room.players.get(playerId) : undefined;
      if (!player || player.role !== 'c') return;
      if (!getActiveThread(room)) return;
      advanceStep(room);
      break;
    }

    case 'MISSION_BRIEF_DISMISS': {
      if (!room) return;
      const playerId = socketToPlayerId.get(ws);
      const player = playerId ? room.players.get(playerId) : undefined;
      // Captain-only — non-captains are silently ignored
      if (!player || player.role !== 'c') return;
      const thread = getActiveThread(room);
      if (!thread) return;
      broadcastToRoom(room, {
        type: 'MISSION_BRIEF_DISMISS',
        missionKey: thread.key,
      });
      break;
    }
  }
}

function handleDisconnect(ws: WebSocket) {
  const roomCode = socketToRoom.get(ws);
  const playerId = socketToPlayerId.get(ws);
  if (!roomCode || !playerId) return;

  const room = rooms.get(roomCode);
  if (!room) return;

  room.players.delete(playerId);
  socketToRoom.delete(ws);
  socketToPlayerId.delete(ws);

  if (room.players.size === 0) {
    stopGameLoop(room);
    if (room.handoffTimer) {
      clearTimeout(room.handoffTimer);
      room.handoffTimer = null;
    }
    room.activeLoopedTones.clear();
    rooms.delete(roomCode);
  } else {
    broadcastPlayerList(room);
  }
}

export function attachGameServer(server: Server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request: IncomingMessage, socket: import('stream').Duplex, head: Buffer) => {
    if (request.url === '/api/ws') {
      wss.handleUpgrade(request, socket, head, (client) => {
        wss.emit('connection', client, request);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (ws: WebSocket) => {
    ws.on('message', (data: Buffer | string) => {
      handleMessage(ws, data.toString());
    });

    ws.on('close', () => {
      handleDisconnect(ws);
    });

    ws.on('error', () => {
      handleDisconnect(ws);
    });

    ws.send(JSON.stringify({ type: 'CONNECTED' }));
  });
}
