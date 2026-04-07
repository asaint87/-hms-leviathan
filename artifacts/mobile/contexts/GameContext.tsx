import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import { Platform } from 'react-native';
import { playSound } from '@/utils/sounds';
import type { MissionThread } from '@/components/game/missionThreads';

export type RoleKey = 'c' | 'n' | 's' | 'e' | 'w';
export type Speed = 'STOP' | '1/3' | '2/3' | 'FULL';

export const ROLE_NAMES: Record<RoleKey, string> = {
  c: 'Captain',
  n: 'Navigator',
  s: 'Sonar',
  e: 'Engineer',
  w: 'Weapons',
};

export const ROLE_COLORS: Record<RoleKey, string> = {
  c: '#ffb300',
  n: '#00cfff',
  s: '#00e0ff',
  e: '#ff8c00',
  w: '#ff3030',
};

export interface SystemStatus {
  id: string;
  name: string;
  status: 'ONLINE' | 'DEGRADED' | 'OFFLINE';
}

export interface Enemy {
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

export interface CompletionOverlay {
  title: string;
  glitch: boolean;
  body: string;
  nextMissionKey?: string;
  delayMs?: number;
}

export interface GameState {
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

export interface PlayerInfo {
  name: string;
  role: RoleKey;
  avatar?: string;
}

export interface VoteState {
  context: string;
  options: string[];
  votes: Record<string, string>;
  myVote: string | null;
}

export interface ActionLogEntry {
  id: string;
  text: string;
  kind: 'info' | 'kill' | 'warn' | 'crit';
  timestamp: number;
}

export interface TorpedoEvent {
  hit: boolean;
  targetId?: number;
  targetBearing?: number;
  targetRange?: number;
  targetType?: string;
  timestamp: number;
}

interface GameContextValue {
  connected: boolean;
  roomCode: string | null;
  myName: string;
  myRole: RoleKey;
  myAvatar: string | null;
  players: PlayerInfo[];
  phase: 'MENU' | 'LOBBY' | 'PLAYING' | 'COMPLETE';
  gameState: GameState | null;
  crisis: { crisisId: string; def: { title: string; description: string } } | null;
  voteState: VoteState | null;
  actionLog: ActionLogEntry[];
  lastTorpedoEvent: TorpedoEvent | null;
  crewReady: RoleKey[];
  // Mission Thread Engine state:
  activeMissionThread: MissionThread | null;
  activeStepIdx: number;
  stepConfirmations: Record<string, RoleKey[]>;
  completionOverlay: CompletionOverlay | null;
  error: string | null;

  setMyName: (name: string) => void;
  setMyRole: (role: RoleKey) => void;
  setMyAvatar: (avatar: string | null) => void;
  createRoom: () => void;
  joinRoom: (code: string) => void;
  startGame: () => void;
  leaveGame: () => void;
  clearError: () => void;

  sonarPing: () => void;
  setHeading: (heading: number) => void;
  setDepth: (depth: number) => void;
  setSpeed: (speed: Speed) => void;
  fireTorpedo: (targetId: number) => void;
  lockTarget: (targetId: number) => void;
  repairHull: () => void;
  rearmTorps: () => void;
  setCooling: (level: number) => void;
  castVote: (vote: string) => void;
  reportReady: () => void;
  startMission: (missionKey: string) => void;
  captainAdvanceStep: () => void;
  dismissCompletionOverlay: () => void;
}

const GameContext = createContext<GameContextValue | null>(null);

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within GameProvider');
  return ctx;
}

function getWsUrl(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) {
    return `wss://${domain}/api/ws`;
  }
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/api/ws`;
  }
  return 'ws://localhost:3000/api/ws';
}

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [myName, setMyName] = useState('');
  const [myRole, setMyRole] = useState<RoleKey>('c');
  const [myAvatar, setMyAvatar] = useState<string | null>(null);
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [phase, setPhase] = useState<'MENU' | 'LOBBY' | 'PLAYING' | 'COMPLETE'>('MENU');
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [crisis, setCrisis] = useState<{
    crisisId: string;
    def: { title: string; description: string };
  } | null>(null);
  const [voteState, setVoteState] = useState<VoteState | null>(null);
  const [actionLog, setActionLog] = useState<ActionLogEntry[]>([]);
  const [lastTorpedoEvent, setLastTorpedoEvent] = useState<TorpedoEvent | null>(null);
  const [crewReady, setCrewReady] = useState<RoleKey[]>([]);
  const [activeMissionThread, setActiveMissionThread] = useState<MissionThread | null>(null);
  const [activeStepIdx, setActiveStepIdx] = useState(0);
  const [stepConfirmations, setStepConfirmations] = useState<Record<string, RoleKey[]>>({});
  const [completionOverlay, setCompletionOverlay] = useState<CompletionOverlay | null>(null);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevHullRef = useRef<number>(100);

  function addLog(text: string, kind: ActionLogEntry['kind'] = 'info') {
    const entry: ActionLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      text,
      kind,
      timestamp: Date.now(),
    };
    setActionLog((prev) => [entry, ...prev].slice(0, 60));
  }

  const send = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(getWsUrl());
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);

      ws.onclose = () => {
        setConnected(false);
        reconnectTimer.current = setTimeout(connect, 2500);
      };

      ws.onerror = () => {
        ws.close();
      };

      ws.onmessage = (event: MessageEvent) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(String(event.data));
        } catch {
          return;
        }

        switch (msg['type']) {
          case 'CONNECTED':
            break;
          case 'ROOM_CREATED':
            setRoomCode(String(msg['code']));
            setPhase('LOBBY');
            break;
          case 'ROOM_JOINED':
            setRoomCode(String(msg['code']));
            setPhase('LOBBY');
            break;
          case 'PLAYER_LIST':
            setPlayers((msg['players'] as PlayerInfo[]) || []);
            break;
          case 'GAME_START':
            setPhase('PLAYING');
            break;
          case 'GAME_STATE': {
            const newState = msg['state'] as GameState;
            setGameState(newState);
            if (msg['players']) setPlayers(msg['players'] as PlayerInfo[]);
            if (msg['crewReady']) setCrewReady(msg['crewReady'] as RoleKey[]);
            if (typeof msg['activeStepIdx'] === 'number') {
              setActiveStepIdx(msg['activeStepIdx'] as number);
            }
            if (msg['stepConfirmations']) {
              setStepConfirmations(msg['stepConfirmations'] as Record<string, RoleKey[]>);
            }
            if (prevHullRef.current > 0 && newState.hull < prevHullRef.current - 5) {
              playSound('hullDamage');
            }
            prevHullRef.current = newState.hull;
            break;
          }
          case 'MISSION_ACTIVE': {
            setActiveMissionThread(msg['thread'] as MissionThread);
            setActiveStepIdx((msg['stepIdx'] as number) ?? 0);
            setStepConfirmations({});
            setCompletionOverlay(null);
            break;
          }
          case 'MISSION_STEP_ADVANCE': {
            const idx = msg['stepIdx'] as number;
            setActiveStepIdx(idx);
            setStepConfirmations({});
            setCrewReady([]);
            break;
          }
          case 'MISSION_COMPLETE_OVERLAY': {
            setCompletionOverlay({
              title: String(msg['title'] || 'MISSION COMPLETE'),
              glitch: !!msg['glitch'],
              body: String(msg['body'] || ''),
              nextMissionKey: msg['nextMissionKey'] as string | undefined,
              delayMs: msg['delayMs'] as number | undefined,
            });
            break;
          }
          case 'PLAY_TONE': {
            // Engine plumbing — actual oscillator implementations come later.
            // Tones not in the playSound switch will silently no-op.
            const tone = String(msg['tone'] || '');
            try { (playSound as any)(tone); } catch {}
            break;
          }
          case 'STOP_TONE': {
            // Looped tones not yet implemented in sounds.ts — no-op for now.
            break;
          }
          case 'MISSION_STEP': {
            // Legacy fallback (no active thread on the server).
            setCrewReady([]);
            addLog(`Mission advancing to step ${(msg['missionStep'] as number) + 1}.`, 'info');
            break;
          }
          case 'CRISIS_START':
            setCrisis({
              crisisId: String(msg['crisisId']),
              def: (msg['def'] as { title: string; description: string }) || {
                title: 'CRISIS',
                description: '',
              },
            });
            playSound('alarmStart');
            addLog(`CRISIS: ${(msg['def'] as any)?.title || msg['crisisId']}`, 'crit');
            break;
          case 'CRISIS_RESOLVE':
            setCrisis(null);
            playSound('alarmStop');
            addLog('Crisis resolved.', 'info');
            break;
          case 'TORPEDO_HIT':
            playSound('explosion');
            setTimeout(() => playSound('kill'), 800);
            addLog(
              `TORPEDO HIT — ${msg['targetType'] || 'target'} DESTROYED!`,
              'kill'
            );
            setLastTorpedoEvent({
              hit: true,
              targetId: msg['targetId'] as number | undefined,
              targetBearing: msg['targetBearing'] as number | undefined,
              targetRange: msg['targetRange'] as number | undefined,
              targetType: msg['targetType'] as string | undefined,
              timestamp: Date.now(),
            });
            break;
          case 'TORPEDO_MISS':
            playSound('torpedoFire');
            addLog('TORPEDO MISS — target evaded.', 'warn');
            setLastTorpedoEvent({
              hit: false,
              targetId: msg['targetId'] as number | undefined,
              targetBearing: msg['targetBearing'] as number | undefined,
              targetRange: msg['targetRange'] as number | undefined,
              timestamp: Date.now(),
            });
            break;
          case 'ACTION_LOG':
            addLog(String(msg['text']), (msg['kind'] as ActionLogEntry['kind']) || 'info');
            break;
          case 'VOTE_STARTED':
            setVoteState({
              context: String(msg['context']),
              options: (msg['options'] as string[]) || [],
              votes: {},
              myVote: null,
            });
            break;
          case 'VOTE_UPDATE':
            setVoteState((prev) =>
              prev ? { ...prev, votes: (msg['votes'] as Record<string, string>) || {} } : prev
            );
            break;
          case 'VOTE_RESULT':
            setVoteState(null);
            addLog(`Vote result: ${msg['result']}`, 'info');
            break;
          case 'MISSION_COMPLETE':
            setPhase('COMPLETE');
            playSound('kill');
            addLog('MISSION COMPLETE — Outstanding crew performance!', 'kill');
            break;
          case 'GAME_OVER':
            setPhase('COMPLETE');
            addLog(`GAME OVER — ${msg['reason']}`, 'crit');
            break;
          case 'ERROR':
            setError(String(msg['message']));
            break;
        }
      };
    } catch {
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const createRoom = useCallback(() => {
    send({ type: 'CREATE_ROOM', name: myName || 'CREW', role: myRole, avatar: myAvatar });
  }, [send, myName, myRole, myAvatar]);

  const joinRoom = useCallback(
    (code: string) => {
      send({ type: 'JOIN_ROOM', code: code.toUpperCase().trim(), name: myName || 'CREW', role: myRole, avatar: myAvatar });
    },
    [send, myName, myRole, myAvatar]
  );

  const startGame = useCallback(() => send({ type: 'START_GAME' }), [send]);

  const leaveGame = useCallback(() => {
    send({ type: 'LEAVE_GAME' });
    setRoomCode(null);
    setPhase('MENU');
    setGameState(null);
    setPlayers([]);
    setCrisis(null);
    setVoteState(null);
    setActionLog([]);
    setLastTorpedoEvent(null);
    setCrewReady([]);
    setActiveMissionThread(null);
    setActiveStepIdx(0);
    setStepConfirmations({});
    setCompletionOverlay(null);
    playSound('alarmStop');
  }, [send]);

  const clearError = useCallback(() => setError(null), []);

  const sonarPing = useCallback(() => {
    send({ type: 'SONAR_PING' });
    playSound('sonarPing');
  }, [send]);

  const setHeading = useCallback((h: number) => send({ type: 'SET_HEADING', heading: h }), [send]);
  const setDepth = useCallback((d: number) => send({ type: 'SET_DEPTH', depth: d }), [send]);
  const setSpeed = useCallback(
    (s: Speed) => {
      send({ type: 'SET_SPEED', speed: s });
      playSound('buttonPress');
    },
    [send]
  );
  const fireTorpedo = useCallback(
    (targetId: number) => {
      send({ type: 'FIRE_TORPEDO', targetId });
      playSound('torpedoFire');
    },
    [send]
  );
  const lockTarget = useCallback(
    (targetId: number) => send({ type: 'LOCK_TARGET', targetId }),
    [send]
  );
  const repairHull = useCallback(() => {
    send({ type: 'REPAIR_HULL' });
    playSound('click');
  }, [send]);
  const rearmTorps = useCallback(() => {
    send({ type: 'REARM_TORPS' });
    playSound('click');
  }, [send]);
  const setCooling = useCallback((level: number) => send({ type: 'SET_COOLING', level }), [send]);
  const reportReady = useCallback(() => send({ type: 'CREW_READY' }), [send]);
  const startMission = useCallback(
    (missionKey: string) => send({ type: 'START_MISSION', missionKey }),
    [send]
  );
  const captainAdvanceStep = useCallback(
    () => send({ type: 'CAPTAIN_ADVANCE_STEP' }),
    [send]
  );
  const dismissCompletionOverlay = useCallback(() => setCompletionOverlay(null), []);
  const castVote = useCallback(
    (vote: string) => {
      send({ type: 'CAST_VOTE', vote });
      setVoteState((prev) => (prev ? { ...prev, myVote: vote } : prev));
    },
    [send]
  );

  return (
    <GameContext.Provider
      value={{
        connected,
        roomCode,
        myName,
        myRole,
        myAvatar,
        players,
        phase,
        gameState,
        crisis,
        voteState,
        actionLog,
        lastTorpedoEvent,
        crewReady,
        activeMissionThread,
        activeStepIdx,
        stepConfirmations,
        completionOverlay,
        error,
        setMyName,
        setMyRole,
        setMyAvatar,
        createRoom,
        joinRoom,
        startGame,
        leaveGame,
        clearError,
        sonarPing,
        setHeading,
        setDepth,
        setSpeed,
        fireTorpedo,
        lockTarget,
        repairHull,
        rearmTorps,
        setCooling,
        castVote,
        reportReady,
        startMission,
        captainAdvanceStep,
        dismissCompletionOverlay,
      }}
    >
      {children}
    </GameContext.Provider>
  );
}
