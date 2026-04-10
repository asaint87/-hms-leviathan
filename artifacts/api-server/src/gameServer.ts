import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage, Server } from 'http';
import {
  // Types
  type World,
  type Crew,
  type CrewMember,
  type RoleKey,
  type Speed,
  type Contact,
  type Alert,
  type Position,
  // Constants
  TACTICAL_MAX_KM,
  CRUSH_DEPTH,
  MAX_DEPTH,
  CRUSH_DAMAGE_PER_SECOND,
  PERISCOPE_MAX_DEPTH,
  REACTOR_MELTDOWN_TEMP,
  // Functions
  createInitialWorld,
  recomputeDerived,
  applyVelocityKnots,
  applySubmarineMotion,
  bearingRangeToOffset,
  detectionRangeKm,
  noiseFromSpeed,
} from '@workspace/world';
import {
  MISSION_THREADS,
  type MissionThread,
  type MissionStep,
  type AutoConfirmTrigger,
  type RequireState,
} from './missions/threads';

// =============================================================================
// Room — server-side state for one game session
//
// Per CLAUDE.md World State Rule:
//  - `world` is the single source of truth shipped via WORLD_UPDATE
//  - Everything else on Room is ephemeral server infrastructure
//    (exception #2) or avatars (exception #3, sent via AVATARS_SNAPSHOT)
// =============================================================================

interface Room {
  code: string;
  world: World;
  phase: 'LOBBY' | 'PLAYING' | 'COMPLETE';
  // ── Ephemeral server infrastructure (exception #2) ──
  gameLoop: ReturnType<typeof setInterval> | null;
  handoffTimer: ReturnType<typeof setTimeout> | null;
  /** Tones currently playing on a loop, started by side effects. */
  activeLoopedTones: Set<string>;
  /** Crisis state mirror — kept ephemeral for the legacy CrisisBanner flow. */
  crisisActive: boolean;
  // ── Avatar cache (exception #3 — never in WORLD_UPDATE) ──
  avatars: Partial<Record<RoleKey, string>>;
}

const rooms = new Map<string, Room>();
const socketToRoom = new Map<WebSocket, string>();
const socketToRole = new Map<WebSocket, RoleKey>();

// =============================================================================
// Room helpers
// =============================================================================

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  if (rooms.has(code)) return generateCode();
  return code;
}

function createRoom(code: string): Room {
  return {
    code,
    world: createInitialWorld(),
    phase: 'LOBBY',
    gameLoop: null,
    handoffTimer: null,
    activeLoopedTones: new Set(),
    crisisActive: false,
    avatars: {},
  };
}

/** Look up the player who sent this socket message. */
function playerFromSocket(
  ws: WebSocket,
): { room: Room; role: RoleKey; member: CrewMember } | null {
  const roomCode = socketToRoom.get(ws);
  if (!roomCode) return null;
  const room = rooms.get(roomCode);
  if (!room) return null;
  const role = socketToRole.get(ws);
  if (!role) return null;
  return { room, role, member: room.world.crew[role] };
}

// =============================================================================
// Broadcasting
// =============================================================================

function broadcastToRoom(room: Room, message: object) {
  const data = JSON.stringify(message);
  // Iterate sockets via socketToRole — sockets connected to this room
  for (const [ws, otherRoomCode] of socketToRoom) {
    if (otherRoomCode !== room.code) continue;
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
}

/**
 * Recompute derived fields and broadcast the full World snapshot.
 * Called after any state mutation. The recompute pass updates
 * Environment.depthZone, ReactorSystem.zone, and every Contact's bearing/range.
 */
function broadcastWorld(room: Room) {
  recomputeDerived(room.world);
  broadcastToRoom(room, {
    type: 'WORLD_UPDATE',
    world: room.world,
  });
}

/** Broadcast the avatar cache. Sent on player join, NOT in WORLD_UPDATE. */
function broadcastAvatars(room: Room) {
  broadcastToRoom(room, {
    type: 'AVATARS_SNAPSHOT',
    avatars: room.avatars,
  });
}

function actionLog(
  room: Room,
  text: string,
  kind: 'info' | 'kill' | 'warn' | 'crit' = 'info',
) {
  broadcastToRoom(room, { type: 'ACTION_LOG', text, kind });
}

// =============================================================================
// Crew seat management
// =============================================================================

function emptyCrewMember(): CrewMember {
  return {
    connected: false,
    playerId: null,
    playerName: null,
    level: 1,
    xp: 0,
  };
}

/**
 * Try to seat a player in a role. Returns true on success, false if the
 * seat is already taken by a different player. The new design enforces
 * one-player-per-role; duplicate joins are rejected (the lobby UI surfaces
 * the error and the player picks another seat).
 */
function seatPlayer(
  room: Room,
  role: RoleKey,
  playerId: string,
  playerName: string,
  avatar: string | undefined,
): boolean {
  const existing = room.world.crew[role];
  if (existing.connected && existing.playerId !== playerId) {
    return false; // seat taken by someone else
  }
  room.world.crew[role] = {
    connected: true,
    playerId,
    playerName,
    level: existing.level || 1,
    xp: existing.xp || 0,
  };
  if (avatar) {
    room.avatars[role] = avatar;
  }
  return true;
}

function unseatPlayer(room: Room, role: RoleKey) {
  room.world.crew[role] = emptyCrewMember();
  delete room.avatars[role];
}

// =============================================================================
// Reactor / hull / motion tick
// =============================================================================

/** Reactor heat load by speed setting (game-tuned, not realistic). */
const REACTOR_LOAD_BY_SPEED: Record<Speed, number> = {
  STOP: 20,
  '1/3': 40,
  '2/3': 70,
  FULL: 100,
  FLANK: 140,
  REVERSE: 30,
};

function tickPhysics(room: Room) {
  const w = room.world;
  const dtSec = 0.5; // 500ms tick

  // ── Reactor temp drift ──
  const reactorLoad = REACTOR_LOAD_BY_SPEED[w.submarine.speed];
  const coolingEffect = w.systems.reactor.coolingLevel * 1.5;
  const tempDelta = (reactorLoad - coolingEffect) * 0.025;
  w.systems.reactor.temp = Math.max(180, Math.min(500, w.systems.reactor.temp + tempDelta));

  // ── Reactor crisis check ──
  if (w.systems.reactor.temp >= REACTOR_MELTDOWN_TEMP && !room.crisisActive) {
    room.crisisActive = true;
    pushAlert(w, 'REACTOR_CRITICAL', 'Reactor temperature critical — insert cooling rods now', 'crit');
    broadcastToRoom(room, {
      type: 'CRISIS_START',
      crisisId: 'REACTOR_MELTDOWN',
      def: {
        title: 'REACTOR MELTDOWN',
        description: 'Reactor temperature critical! Insert cooling rods to 95%+',
      },
    });
    actionLog(room, 'CRISIS: REACTOR MELTDOWN — temperature critical!', 'crit');
  } else if (room.crisisActive && w.systems.reactor.temp < 400) {
    room.crisisActive = false;
    dismissAlertsByType(w, 'REACTOR_CRITICAL');
    broadcastToRoom(room, { type: 'CRISIS_RESOLVE' });
    actionLog(room, 'CRISIS RESOLVED — reactor temperature stable.', 'info');
  }

  // ── Reactor damage to hull when over meltdown threshold ──
  if (w.systems.reactor.temp >= REACTOR_MELTDOWN_TEMP) {
    w.submarine.hullIntegrity = Math.max(0, w.submarine.hullIntegrity - 0.3);
  }

  // ── Crush depth damage ──
  if (w.submarine.depth > CRUSH_DEPTH) {
    w.submarine.hullIntegrity = Math.max(
      0,
      w.submarine.hullIntegrity - CRUSH_DAMAGE_PER_SECOND * dtSec,
    );
  }

  // ── Submarine motion ──
  w.submarine.position = applySubmarineMotion(
    w.submarine.position,
    w.submarine.heading,
    w.submarine.speed,
    dtSec,
  );

  // ── Propulsion noise from speed ──
  w.systems.propulsion.noise = noiseFromSpeed(w.submarine.speed);

  // ── Contact motion (deterministic — no random walk) ──
  for (const contact of w.contacts) {
    if (contact.destroyed) continue;
    contact.position = applyVelocityKnots(contact.position, contact.velocity, dtSec);
  }

  // ── Hull lost ──
  if (w.submarine.hullIntegrity <= 0 && room.phase === 'PLAYING') {
    room.phase = 'COMPLETE';
    broadcastToRoom(room, { type: 'GAME_OVER', reason: 'Hull integrity lost — all hands lost.' });
    stopGameLoop(room);
  }
}

function startGameLoop(room: Room) {
  if (room.gameLoop) return;
  room.gameLoop = setInterval(() => {
    tickPhysics(room);
    broadcastWorld(room);
  }, 500);
}

function stopGameLoop(room: Room) {
  if (room.gameLoop) {
    clearInterval(room.gameLoop);
    room.gameLoop = null;
  }
}

// =============================================================================
// Alerts
// =============================================================================

function pushAlert(
  world: World,
  type: Alert['type'],
  message: string,
  severity: Alert['severity'],
) {
  // Don't duplicate active alerts of the same type
  if (world.alerts.some((a) => a.type === type && !a.dismissed)) return;
  world.alerts.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type,
    message,
    severity,
    timestamp: Date.now(),
    dismissed: false,
  });
}

function dismissAlertsByType(world: World, type: Alert['type']) {
  for (const alert of world.alerts) {
    if (alert.type === type) alert.dismissed = true;
  }
}

// =============================================================================
// Mission Thread Engine
// =============================================================================

function getActiveThread(room: Room): MissionThread | null {
  if (!room.world.mission.activeMissionKey) return null;
  return MISSION_THREADS[room.world.mission.activeMissionKey] ?? null;
}

function getCurrentStep(room: Room): MissionStep | null {
  const thread = getActiveThread(room);
  if (!thread) return null;
  return thread.steps[room.world.mission.currentStep] ?? null;
}

/** Initialize a fresh per-step confirmation map (all roles false). */
function freshStepConfirmations(): Record<RoleKey, boolean> {
  return { c: false, n: false, s: false, e: false, w: false };
}

/** Stop all looped tones started by previous steps. */
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
        // Convert sub-relative bearing+range to absolute world position.
        // Use the submarine's CURRENT position as the origin at spawn time.
        const offset = bearingRangeToOffset(c.bearing, c.range * TACTICAL_MAX_KM);
        const position: Position = {
          x: room.world.submarine.position.x + offset.x,
          y: room.world.submarine.position.y + offset.y,
        };
        const nextId =
          room.world.contacts.reduce((max, contact) => Math.max(max, contact.id), 0) + 1;
        room.world.contacts.push({
          id: nextId,
          position,
          velocity: c.velocity ?? { speed: 0, heading: 0 },
          // Derived — recomputeDerived() at next broadcast will fill these
          bearing: 0,
          range: 0,
          identified: c.identified ?? false,
          detected: c.detected ?? false,
          destroyed: false,
          type: c.type,
          color: c.color ?? '#ff3030',
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

/** Initialize a mission thread. Resets step state and broadcasts. */
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

  room.world.mission.activeMissionKey = missionKey;
  room.world.mission.currentStep = 0;
  room.world.mission.stepConfirmations = {};
  room.world.mission.handoffTimer = false;

  // Pre-init the first step's confirmation slot
  const firstStep = thread.steps[0];
  if (firstStep) {
    room.world.mission.stepConfirmations[firstStep.id] = freshStepConfirmations();
  }

  broadcastToRoom(room, { type: 'MISSION_ACTIVE', thread, stepIdx: 0 });
  actionLog(room, `MISSION THREAD: ${thread.name} — Step 1 active`, 'info');

  // Apply side effects of the first step
  if (firstStep) applyStepSideEffects(room, firstStep);

  broadcastWorld(room);
}

/** Advance to the next step or complete the mission. */
function advanceStep(room: Room) {
  const thread = getActiveThread(room);
  if (!thread) return;

  // Stop any looped tones from the step we're leaving
  clearLoopedTones(room);

  const nextIdx = room.world.mission.currentStep + 1;
  if (nextIdx >= thread.steps.length) {
    completeMission(room);
    return;
  }

  room.world.mission.currentStep = nextIdx;

  // Pre-init the new step's confirmation slot
  const nextStep = thread.steps[nextIdx];
  room.world.mission.stepConfirmations[nextStep.id] = freshStepConfirmations();

  broadcastToRoom(room, {
    type: 'MISSION_STEP_ADVANCE',
    stepIdx: nextIdx,
    stepId: nextStep.id,
  });
  actionLog(
    room,
    `Thread step ${nextIdx + 1}: ${nextStep.doneText || ''}`,
    'info',
  );

  applyStepSideEffects(room, nextStep);
  broadcastWorld(room);
}

/** Complete the active mission. Triggers handoff if defined. */
function completeMission(room: Room) {
  const thread = getActiveThread(room);
  if (!thread) return;

  clearLoopedTones(room);
  actionLog(room, `MISSION ${thread.name} — ALL STEPS COMPLETE`, 'kill');

  if (thread.handoff) {
    const { nextMission, delayMs, completionOverlay } = thread.handoff;
    room.world.mission.handoffTimer = true;
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
      room.world.mission.handoffTimer = false;
      initMission(room, nextMission);
    }, delayMs);
    broadcastWorld(room);
  } else {
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

  // Ensure the step's confirmation slot exists, then mark this role
  if (!room.world.mission.stepConfirmations[step.id]) {
    room.world.mission.stepConfirmations[step.id] = freshStepConfirmations();
  }
  room.world.mission.stepConfirmations[step.id][role] = true;

  // Check if all required roles are confirmed
  const confirmed = room.world.mission.stepConfirmations[step.id];
  const allDone =
    step.waitFor.length > 0 && step.waitFor.every((r) => confirmed[r] === true);

  broadcastWorld(room);

  // If the step requires captain manual advance, do not auto-advance even
  // when all crew confirmations are in. The captain owns the dramatic beat.
  if (allDone && !step.requireCaptainAdvance) {
    setTimeout(() => advanceStep(room), 600);
    return true;
  }
  return false;
}

/** requireState predicate against current world state. Wraparound-aware for heading. */
function checkRequireState(world: World, req: RequireState): boolean {
  if (req.speed !== undefined && world.submarine.speed !== req.speed) return false;

  if (req.heading) {
    const h = req.heading;
    if (h.equals !== undefined && Math.round(world.submarine.heading) !== h.equals) return false;
    if (h.near !== undefined) {
      const tol = h.tolerance ?? 5;
      const diff = Math.abs(((world.submarine.heading - h.near + 540) % 360) - 180);
      if (diff > tol) return false;
    }
  }

  if (req.depth) {
    const d = req.depth;
    if (d.equals !== undefined && world.submarine.depth !== d.equals) return false;
    if (d.near !== undefined) {
      const tol = d.tolerance ?? 5;
      if (Math.abs(world.submarine.depth - d.near) > tol) return false;
    }
  }

  return true;
}

function tryAutoConfirm(room: Room, trigger: AutoConfirmTrigger) {
  const step = getCurrentStep(room);
  if (!step?.autoConfirmOn) return;
  if (step.autoConfirmOn.trigger !== trigger) return;
  if (step.autoConfirmOn.requireState) {
    if (!checkRequireState(room.world, step.autoConfirmOn.requireState)) return;
  }
  confirmStep(room, step.autoConfirmOn.role);
}

// =============================================================================
// Message handler
// =============================================================================

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
      const newRoom = createRoom(code);
      const role = (msg['role'] as RoleKey) || 'c';
      const playerId = `${Date.now()}-${Math.random()}`;
      const playerName = String(msg['name'] || 'UNKNOWN');
      const avatar = msg['avatar'] ? String(msg['avatar']) : undefined;

      seatPlayer(newRoom, role, playerId, playerName, avatar);
      rooms.set(code, newRoom);
      socketToRoom.set(ws, code);
      socketToRole.set(ws, role);
      ws.send(JSON.stringify({ type: 'ROOM_CREATED', code }));
      broadcastAvatars(newRoom);
      broadcastWorld(newRoom);
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
      const role = (msg['role'] as RoleKey) || 'c';
      const playerId = `${Date.now()}-${Math.random()}`;
      const playerName = String(msg['name'] || 'UNKNOWN');
      const avatar = msg['avatar'] ? String(msg['avatar']) : undefined;

      const seated = seatPlayer(joinRoom, role, playerId, playerName, avatar);
      if (!seated) {
        ws.send(JSON.stringify({
          type: 'ERROR',
          message: `Role ${role.toUpperCase()} is already taken — pick another station.`,
        }));
        return;
      }

      socketToRoom.set(ws, String(msg['code']));
      socketToRole.set(ws, role);
      ws.send(JSON.stringify({ type: 'ROOM_JOINED', code: msg['code'] }));

      broadcastAvatars(joinRoom);
      broadcastWorld(joinRoom);

      if (joinRoom.phase === 'PLAYING') {
        ws.send(JSON.stringify({ type: 'GAME_START' }));
      }
      break;
    }

    case 'START_GAME': {
      if (!room || room.phase !== 'LOBBY') return;
      room.phase = 'PLAYING';
      broadcastToRoom(room, { type: 'GAME_START' });
      broadcastWorld(room);
      startGameLoop(room);
      actionLog(room, 'HMS Leviathan is underway. Battle stations.', 'info');
      // Auto-initialize the training simulation. MT0 hands off to M01.
      if (MISSION_THREADS['MT0']) {
        initMission(room, 'MT0');
      } else if (MISSION_THREADS['M01']) {
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
      const w = room.world;
      const detectRangeKm = detectionRangeKm(w.systems.sonar.powerLevel);
      // Brief mode flip for the audio feedback / visual ping
      w.systems.sonar.mode = 'ACTIVE';
      let newlyDetected = 0;
      for (const contact of w.contacts) {
        if (contact.destroyed) continue;
        // Distance from sub to contact in km — use absolute positions
        const dx = contact.position.x - w.submarine.position.x;
        const dy = contact.position.y - w.submarine.position.y;
        const distKm = Math.sqrt(dx * dx + dy * dy);
        if (distKm <= detectRangeKm) {
          if (!contact.detected) newlyDetected++;
          contact.detected = true;
          contact.strength = Math.max(0.3, 1 - (distKm / TACTICAL_MAX_KM) * 0.7);
          if (distKm < 9) {
            contact.identified = true;
          }
        }
      }
      const totalDetected = w.contacts.filter((c) => c.detected && !c.destroyed).length;
      broadcastWorld(room);
      actionLog(
        room,
        `Sonar PING — ${totalDetected} contact${totalDetected !== 1 ? 's' : ''} detected.`,
        'info',
      );
      // Sonar returns to passive after the ping echoes
      setTimeout(() => {
        if (room.world.systems.sonar.mode === 'ACTIVE') {
          room.world.systems.sonar.mode = 'PASSIVE';
          broadcastWorld(room);
        }
      }, 1500);
      tryAutoConfirm(room, 'SONAR_PING');
      break;
    }

    case 'SET_HEADING': {
      if (!room) return;
      let h = Math.round(Number(msg['heading'])) % 360;
      if (h < 0) h += 360;
      room.world.submarine.heading = h;
      broadcastWorld(room);
      tryAutoConfirm(room, 'SET_HEADING');
      break;
    }

    case 'SET_DEPTH': {
      if (!room) return;
      const requestedDepth = Number(msg['depth']);
      room.world.submarine.depth = Math.max(0, Math.min(MAX_DEPTH, requestedDepth));
      broadcastWorld(room);
      tryAutoConfirm(room, 'SET_DEPTH');
      break;
    }

    case 'SET_SPEED': {
      if (!room) return;
      const validSpeeds: Speed[] = ['STOP', '1/3', '2/3', 'FULL', 'FLANK', 'REVERSE'];
      const spd = msg['speed'] as Speed;
      if (validSpeeds.includes(spd)) {
        room.world.submarine.speed = spd;
        broadcastWorld(room);
        actionLog(room, `Navigator — Speed set to ${spd}.`, 'info');
        tryAutoConfirm(room, 'SET_SPEED');
      }
      break;
    }

    case 'LOCK_TARGET': {
      if (!room) return;
      const targetId = Number(msg['targetId']);
      const target = room.world.contacts.find((c) => c.id === targetId && !c.destroyed);
      if (target) {
        room.world.systems.weapons.locked = true;
        room.world.systems.weapons.lockedContactId = targetId;
        broadcastWorld(room);
      }
      tryAutoConfirm(room, 'WEAPONS_LOCK');
      break;
    }

    case 'FIRE_TORPEDO': {
      if (!room) return;
      const w = room.world;
      if (w.systems.weapons.torpedoesLoaded <= 0) {
        ws.send(JSON.stringify({ type: 'ERROR', message: 'No torpedoes loaded.' }));
        return;
      }
      w.systems.weapons.torpedoesLoaded--;
      const target = w.contacts.find(
        (c) => c.id === Number(msg['targetId']) && !c.destroyed,
      );
      if (target) {
        // Compute distance for hit chance — closer = more accurate
        const dx = target.position.x - w.submarine.position.x;
        const dy = target.position.y - w.submarine.position.y;
        const distKm = Math.sqrt(dx * dx + dy * dy);
        const rangeFrac = Math.min(1, distKm / TACTICAL_MAX_KM);
        const hitChance = Math.max(0.45, 0.93 - rangeFrac * 0.65);
        const hit = Math.random() < hitChance;
        if (hit) {
          target.destroyed = true;
          // Clear lock if we locked this target
          if (w.systems.weapons.lockedContactId === target.id) {
            w.systems.weapons.locked = false;
            w.systems.weapons.lockedContactId = null;
          }
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
      broadcastWorld(room);
      tryAutoConfirm(room, 'FIRE_TORPEDO');
      break;
    }

    case 'REPAIR_HULL': {
      if (!room) return;
      actionLog(room, 'Engineer — Hull repair sequence started...', 'info');
      setTimeout(() => {
        if (!room || room.phase !== 'PLAYING') return;
        room.world.submarine.hullIntegrity = Math.min(
          100,
          room.world.submarine.hullIntegrity + 15,
        );
        broadcastWorld(room);
        actionLog(room, 'Engineer — Hull repair complete. +15% integrity.', 'info');
      }, 3000);
      break;
    }

    case 'REARM_TORPS': {
      if (!room) return;
      const w = room.world;
      if (w.systems.weapons.torpedoReserve <= 0) {
        ws.send(JSON.stringify({ type: 'ERROR', message: 'No reserve torpedoes.' }));
        return;
      }
      const toLoad = Math.min(w.systems.weapons.torpedoReserve, 6 - w.systems.weapons.torpedoesLoaded);
      if (toLoad === 0) {
        ws.send(JSON.stringify({ type: 'ERROR', message: 'All tubes already loaded.' }));
        return;
      }
      w.systems.weapons.torpedoReserve -= toLoad;
      w.systems.weapons.torpedoesLoaded += toLoad;
      broadcastWorld(room);
      actionLog(
        room,
        `Engineer — Torpedoes rearmed. ${w.systems.weapons.torpedoesLoaded} tubes loaded.`,
        'info',
      );
      break;
    }

    case 'SET_COOLING': {
      if (!room) return;
      room.world.systems.reactor.coolingLevel = Math.max(0, Math.min(100, Number(msg['level'])));
      broadcastWorld(room);
      break;
    }

    case 'CREW_READY': {
      if (!room) return;
      const found = playerFromSocket(ws);
      if (!found) return;
      const { role, member } = found;
      actionLog(
        room,
        `${member.playerName} (${role.toUpperCase()}) reports READY.`,
        'info',
      );
      // Mission engine handles the confirmation if a mission is active.
      // Without an active mission, CREW_READY is a no-op (no legacy fallback).
      if (getActiveThread(room)) {
        confirmStep(room, role);
      }
      break;
    }

    case 'START_MISSION': {
      if (!room) return;
      const found = playerFromSocket(ws);
      if (!found || found.role !== 'c') return;
      const key = String(msg['missionKey'] || '');
      if (!key) return;
      initMission(room, key);
      break;
    }

    case 'CAPTAIN_ADVANCE_STEP': {
      if (!room) return;
      const found = playerFromSocket(ws);
      if (!found || found.role !== 'c') return;
      if (!getActiveThread(room)) return;
      advanceStep(room);
      break;
    }

    case 'MISSION_BRIEF_DISMISS': {
      if (!room) return;
      const found = playerFromSocket(ws);
      if (!found || found.role !== 'c') return;
      const thread = getActiveThread(room);
      if (!thread) return;
      broadcastToRoom(room, {
        type: 'MISSION_BRIEF_DISMISS',
        missionKey: thread.key,
      });
      break;
    }

    case 'DISMISS_ALERT': {
      if (!room) return;
      const alertId = String(msg['alertId'] || '');
      const alert = room.world.alerts.find((a) => a.id === alertId);
      if (!alert) return;
      // Critical alert types cannot be client-dismissed (per CLAUDE.md / Q-G).
      if (alert.type === 'REACTOR_CRITICAL' || alert.type === 'TORPEDO_INCOMING') return;
      alert.dismissed = true;
      broadcastWorld(room);
      break;
    }
  }
}

function handleDisconnect(ws: WebSocket) {
  const roomCode = socketToRoom.get(ws);
  const role = socketToRole.get(ws);
  if (!roomCode || !role) return;

  const room = rooms.get(roomCode);
  if (!room) return;

  unseatPlayer(room, role);
  socketToRoom.delete(ws);
  socketToRole.delete(ws);

  // Are any seats still connected?
  const stillConnected =
    room.world.crew.c.connected ||
    room.world.crew.n.connected ||
    room.world.crew.s.connected ||
    room.world.crew.e.connected ||
    room.world.crew.w.connected;

  if (!stillConnected) {
    stopGameLoop(room);
    if (room.handoffTimer) {
      clearTimeout(room.handoffTimer);
      room.handoffTimer = null;
    }
    room.activeLoopedTones.clear();
    rooms.delete(roomCode);
  } else {
    broadcastAvatars(room);
    broadcastWorld(room);
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
