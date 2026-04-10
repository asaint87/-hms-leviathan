import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import { Platform } from 'react-native';
import { playSound, stopSound } from '@/utils/sounds';
import type { MissionThread } from '@/components/game/missionThreads';

// All canonical game types come from @workspace/world.
// This file used to declare its own GameState/Enemy/Speed/SystemStatus —
// those are gone. The single source of truth is the World object the
// server broadcasts via WORLD_UPDATE.
import {
  type World,
  type Contact,
  type Speed,
  type RoleKey,
  type Crew,
  type CrewMember,
  type Alert,
} from '@workspace/world';

export type { World, Contact, Speed, RoleKey, Crew, CrewMember, Alert };

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

// -----------------------------------------------------------------------------
// Backwards-compat alias: many station files import `Enemy` from this module.
// Migrating them all in one commit; meanwhile, alias to `Contact`.
// -----------------------------------------------------------------------------
export type Enemy = Contact;

// -----------------------------------------------------------------------------
// Client-only state shapes (not in the world)
// -----------------------------------------------------------------------------

export interface CompletionOverlay {
  title: string;
  glitch: boolean;
  body: string;
  nextMissionKey?: string;
  delayMs?: number;
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

// -----------------------------------------------------------------------------
// Context value
// -----------------------------------------------------------------------------

interface GameContextValue {
  connected: boolean;
  roomCode: string | null;
  myName: string;
  myRole: RoleKey;
  myAvatar: string | null;
  /** The full World object from the server. Null until first WORLD_UPDATE. */
  world: World | null;
  /**
   * Avatars cache — keyed by role. Sent via AVATARS_SNAPSHOT (one-shot on
   * join), NOT in WORLD_UPDATE per the World State Rule (CLAUDE.md exception #3).
   */
  crewAvatars: Partial<Record<RoleKey, string>>;
  phase: 'MENU' | 'LOBBY' | 'PLAYING' | 'COMPLETE';
  crisis: { crisisId: string; def: { title: string; description: string } } | null;
  voteState: VoteState | null;
  actionLog: ActionLogEntry[];
  lastTorpedoEvent: TorpedoEvent | null;
  // Mission Thread Engine state — driven by MISSION_ACTIVE / MISSION_STEP_ADVANCE
  activeMissionThread: MissionThread | null;
  completionOverlay: CompletionOverlay | null;
  /** Mission key whose brief overlay was last dismissed by the captain. */
  briefDismissedFor: string | null;
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
  dismissMissionBrief: () => void;
  dismissAlert: (alertId: string) => void;
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
  const [world, setWorld] = useState<World | null>(null);
  const [crewAvatars, setCrewAvatars] = useState<Partial<Record<RoleKey, string>>>({});
  const [phase, setPhase] = useState<'MENU' | 'LOBBY' | 'PLAYING' | 'COMPLETE'>('MENU');
  const [crisis, setCrisis] = useState<{
    crisisId: string;
    def: { title: string; description: string };
  } | null>(null);
  const [voteState, setVoteState] = useState<VoteState | null>(null);
  const [actionLog, setActionLog] = useState<ActionLogEntry[]>([]);
  const [lastTorpedoEvent, setLastTorpedoEvent] = useState<TorpedoEvent | null>(null);
  const [activeMissionThread, setActiveMissionThread] = useState<MissionThread | null>(null);
  const [completionOverlay, setCompletionOverlay] = useState<CompletionOverlay | null>(null);
  const [briefDismissedFor, setBriefDismissedFor] = useState<string | null>(null);
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
          case 'GAME_START':
            setPhase('PLAYING');
            break;
          case 'WORLD_UPDATE': {
            const newWorld = msg['world'] as World;
            setWorld(newWorld);
            // Hull damage sound effect — fire when hull drops by >5 since last update
            if (
              prevHullRef.current > 0 &&
              newWorld.submarine.hullIntegrity < prevHullRef.current - 5
            ) {
              playSound('hullDamage');
            }
            prevHullRef.current = newWorld.submarine.hullIntegrity;
            break;
          }
          case 'AVATARS_SNAPSHOT': {
            const incoming = (msg['avatars'] || {}) as Partial<Record<RoleKey, string>>;
            setCrewAvatars(incoming);
            break;
          }
          case 'MISSION_ACTIVE': {
            const newThread = msg['thread'] as MissionThread;
            setActiveMissionThread(newThread);
            setCompletionOverlay(null);
            // Reset brief dismissal so the new mission's brief overlay shows.
            setBriefDismissedFor(null);
            break;
          }
          case 'MISSION_BRIEF_DISMISS': {
            setBriefDismissedFor(String(msg['missionKey'] || ''));
            break;
          }
          case 'MISSION_STEP_ADVANCE': {
            // World already carries the new step index via mission.currentStep
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
            const tone = String(msg['tone'] || '');
            const loop = !!msg['loop'];
            try { playSound(tone, { loop }); } catch {}
            break;
          }
          case 'STOP_TONE': {
            const tone = String(msg['tone'] || '');
            try { stopSound(tone); } catch {}
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
    setWorld(null);
    setCrewAvatars({});
    setCrisis(null);
    setVoteState(null);
    setActionLog([]);
    setLastTorpedoEvent(null);
    setActiveMissionThread(null);
    setCompletionOverlay(null);
    setBriefDismissedFor(null);
    // Stop any looped tones still playing (e.g. abyssalPulse from MT0 s8)
    try { stopSound('abyssalPulse'); } catch {}
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
  const castVote = useCallback(
    (vote: string) => {
      send({ type: 'CAST_VOTE', vote });
      setVoteState((prev) => (prev ? { ...prev, myVote: vote } : prev));
    },
    [send]
  );
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
  const dismissMissionBrief = useCallback(
    () => send({ type: 'MISSION_BRIEF_DISMISS' }),
    [send]
  );
  const dismissAlert = useCallback(
    (alertId: string) => send({ type: 'DISMISS_ALERT', alertId }),
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
        world,
        crewAvatars,
        phase,
        crisis,
        voteState,
        actionLog,
        lastTorpedoEvent,
        activeMissionThread,
        completionOverlay,
        briefDismissedFor,
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
        dismissMissionBrief,
        dismissAlert,
      }}
    >
      {children}
    </GameContext.Provider>
  );
}
