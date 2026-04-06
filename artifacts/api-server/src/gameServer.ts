import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage, Server } from 'http';

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
  broadcastToRoom(room, {
    type: 'GAME_STATE',
    state: room.gameState,
    players: Array.from(room.players.values()).map((p) => ({
      name: p.name,
      role: p.role,
      avatar: p.avatar,
    })),
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
      broadcastToRoom(room, { type: 'GAME_START' });
      broadcastGameState(room);
      startGameLoop(room);
      actionLog(room, 'HMS Leviathan is underway. Battle stations.', 'info');
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
      break;
    }

    case 'SET_HEADING': {
      if (!room) return;
      let h = Math.round(Number(msg['heading'])) % 360;
      if (h < 0) h += 360;
      room.gameState.heading = h;
      break;
    }

    case 'SET_DEPTH': {
      if (!room) return;
      room.gameState.depth = Math.max(18, Math.min(300, Number(msg['depth'])));
      broadcastGameState(room);
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
      }
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
