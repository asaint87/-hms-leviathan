import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  type GestureResponderEvent,
} from 'react-native';
import * as Haptics from 'expo-haptics';

import { useGame } from '@/contexts/GameContext';
import { Colors } from '@/constants/Colors';
import {
  type Contact,
  type Speed,
  type World,
  bearingRangeToOffset,
} from '@workspace/world';

const IS_WEB_RUNTIME =
  typeof window !== 'undefined' &&
  typeof document !== 'undefined' &&
  typeof requestAnimationFrame !== 'undefined';

const UI = {
  bg: '#02080b',
  panel: 'rgba(3,18,23,0.92)',
  border: 'rgba(77,255,174,0.18)',
  green: '#4dffae',
  teal: '#00e5cc',
  blue: '#43b7ff',
  amber: '#ffd447',
  red: '#ff625d',
  muted: '#58736c',
  dim: '#213b37',
};

type ViewMode = 'chart' | 'depth' | 'sonar';
type SteeringMode = 'auto' | 'helm';
type ToolMode = 'plot' | 'beacon' | 'discover';
type WaypointType = 'objective' | 'harbor' | 'poi' | 'beacon';
type TerrainType = 'shallows' | 'ridge' | 'trench' | 'kelp' | 'canyon' | 'abyss' | 'open';
type BallastAction = 'idle' | 'flood' | 'blow';

type NavWaypoint = {
  id: string;
  x: number;
  y: number;
  type: WaypointType;
  label: string;
  reached: boolean;
};

type TerrainRegion = {
  id: string;
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  type: TerrainType;
  depth: number;
  label: string;
  angle?: number;
};

type CurrentRegion = {
  id: string;
  x: number;
  y: number;
  radius: number;
  direction: number;
  strength: number;
};

type FogCell = {
  x: number;
  y: number;
  visited: boolean;
};

type ProbeBeacon = {
  id: string;
  x: number;
  y: number;
  deployedAt: number;
};

type NavigationData = {
  waypoints: NavWaypoint[];
  currentCourse: string[];
  terrain: TerrainRegion[];
  currents: CurrentRegion[];
  fogOfWar: FogCell[];
  beacons: ProbeBeacon[];
};

type NavWorld = World & {
  navigation?: Partial<NavigationData>;
};

type JoystickState = {
  active: boolean;
  x: number;
  y: number;
};

const SPEEDS: Speed[] = ['STOP', '1/3', '2/3', 'FULL'];
const SPEED_COLORS: Record<Speed, string> = {
  STOP: UI.muted,
  '1/3': UI.green,
  '2/3': UI.amber,
  FULL: UI.red,
  FLANK: UI.red,
  REVERSE: UI.blue,
};

const MAP_KM_RADIUS = 40;
const FOG_CELL_KM = 6;
const PROFILE_DISTANCE_KM = 5;
const MAX_PROFILE_DEPTH = 360;

export function NavigatorStation() {
  const { world, setHeading, setDepth, setSpeed } = useGame();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const worldRef = useRef<World | null>(world);
  const navSeedRef = useRef<NavigationData | null>(null);
  const viewModeRef = useRef<ViewMode>('chart');
  const steeringModeRef = useRef<SteeringMode>('auto');
  const targetDepthRef = useRef(world?.submarine.depth ?? 50);
  const fwdTankRef = useRef(0.52);
  const aftTankRef = useRef(0.48);
  const ballastActionRef = useRef<BallastAction>('idle');
  const [viewMode, setViewMode] = useState<ViewMode>('chart');
  const [steeringMode, setSteeringMode] = useState<SteeringMode>('auto');
  const [toolMode, setToolMode] = useState<ToolMode>('plot');
  const [courseIds, setCourseIds] = useState<string[]>([]);
  const [localWaypoints, setLocalWaypoints] = useState<NavWaypoint[]>([]);
  const [localBeacons, setLocalBeacons] = useState<ProbeBeacon[]>([]);
  const [visitedCells, setVisitedCells] = useState<Record<string, boolean>>({});
  const [selectedWaypointId, setSelectedWaypointId] = useState<string | null>(null);
  const [targetDepth, setTargetDepth] = useState(world?.submarine.depth ?? 50);
  const [fwdTank, setFwdTank] = useState(0.52);
  const [aftTank, setAftTank] = useState(0.48);
  const [ballastAction, setBallastAction] = useState<BallastAction>('idle');
  const [joystick, setJoystick] = useState<JoystickState>({ active: false, x: 0, y: 0 });

  useEffect(() => {
    worldRef.current = world;
    if (world && !navSeedRef.current) {
      navSeedRef.current = createMockNavigation(world.submarine.position.x, world.submarine.position.y);
      setCourseIds(navSeedRef.current.currentCourse);
    }
  }, [world]);

  useEffect(() => {
    viewModeRef.current = viewMode;
  }, [viewMode]);

  useEffect(() => {
    steeringModeRef.current = steeringMode;
  }, [steeringMode]);

  useEffect(() => {
    targetDepthRef.current = targetDepth;
  }, [targetDepth]);

  useEffect(() => {
    fwdTankRef.current = fwdTank;
    aftTankRef.current = aftTank;
  }, [fwdTank, aftTank]);

  useEffect(() => {
    ballastActionRef.current = ballastAction;
  }, [ballastAction]);

  useEffect(() => {
    if (!world) return;
    const sub = world.submarine.position;
    const next: Record<string, boolean> = {};
    for (let gx = -2; gx <= 2; gx += 1) {
      for (let gy = -2; gy <= 2; gy += 1) {
        if (Math.hypot(gx, gy) <= 2.2) {
          next[cellKey(Math.floor(sub.x / FOG_CELL_KM) + gx, Math.floor(sub.y / FOG_CELL_KM) + gy)] = true;
        }
      }
    }
    setVisitedCells((prev) => ({ ...prev, ...next }));
  }, [world?.submarine.position.x, world?.submarine.position.y, world]);

  const navigation = useMemo(() => {
    if (!world) return null;
    const base = navSeedRef.current ?? createMockNavigation(world.submarine.position.x, world.submarine.position.y);
    return mergeNavigation(world, base, courseIds, localWaypoints, localBeacons);
  }, [world, courseIds, localWaypoints, localBeacons]);

  const currentTerrain = useMemo(() => {
    if (!world || !navigation) return null;
    return terrainAt(navigation.terrain, world.submarine.position.x, world.submarine.position.y);
  }, [world, navigation]);

  const nextWaypoint = useMemo(() => {
    if (!world || !navigation) return null;
    const courseWaypoint = navigation.currentCourse
      .map((id) => navigation.waypoints.find((waypoint) => waypoint.id === id))
      .find((waypoint): waypoint is NavWaypoint => !!waypoint && !waypoint.reached);
    return courseWaypoint ?? navigation.waypoints.find((waypoint) => !waypoint.reached) ?? null;
  }, [world, navigation]);

  const eta = useMemo(() => {
    if (!world || !nextWaypoint) return '--';
    const dist = distanceKm(world.submarine.position.x, world.submarine.position.y, nextWaypoint.x, nextWaypoint.y);
    const speed = speedToKms(world.submarine.speed);
    if (speed <= 0) return '--';
    return `${Math.max(1, Math.round(dist / speed / 60))}m`;
  }, [world, nextWaypoint]);

  const currentZone = useMemo(() => {
    if (!world || !navigation) return null;
    return navigation.currents.find(
      (current) => distanceKm(world.submarine.position.x, world.submarine.position.y, current.x, current.y) < current.radius
    ) ?? null;
  }, [world, navigation]);

  useEffect(() => {
    if (!IS_WEB_RUNTIME) return;
    let raf = 0;

    const frame = (time: number) => {
      const canvas = canvasRef.current;
      const liveWorld = worldRef.current;
      const baseNav = navSeedRef.current;
      if (canvas && liveWorld && baseNav) {
        fitCanvasToParent(canvas);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const nav = mergeNavigation(liveWorld, baseNav, courseIds, localWaypoints, localBeacons);
          if (viewModeRef.current === 'depth') {
            drawDepthProfile(ctx, canvas.width, canvas.height, liveWorld, nav, targetDepthRef.current, time);
          } else if (viewModeRef.current === 'sonar') {
            drawSonarRepeater(ctx, canvas.width, canvas.height, liveWorld, time, false);
          } else {
            drawChart(ctx, canvas.width, canvas.height, {
              world: liveWorld,
              navigation: nav,
              selectedWaypointId,
              visitedCells,
              targetDepth: targetDepthRef.current,
              time,
            });
          }
        }
      }
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [courseIds, localWaypoints, localBeacons, selectedWaypointId, visitedCells]);

  const revealAround = useCallback((x: number, y: number, radiusCells: number) => {
    const cx = Math.floor(x / FOG_CELL_KM);
    const cy = Math.floor(y / FOG_CELL_KM);
    const next: Record<string, boolean> = {};
    for (let gx = -radiusCells; gx <= radiusCells; gx += 1) {
      for (let gy = -radiusCells; gy <= radiusCells; gy += 1) {
        if (Math.hypot(gx, gy) <= radiusCells + 0.25) {
          next[cellKey(cx + gx, cy + gy)] = true;
        }
      }
    }
    setVisitedCells((prev) => ({ ...prev, ...next }));
  }, []);

  const plotWaypoint = useCallback(
    (waypoint: NavWaypoint) => {
      if (!world) return;
      setSelectedWaypointId(waypoint.id);
      setCourseIds((prev) => (prev.includes(waypoint.id) ? prev : [...prev, waypoint.id]));
      const nextHeading = bearingBetween(world.submarine.position.x, world.submarine.position.y, waypoint.x, waypoint.y);
      setHeading(nextHeading);
      void Haptics.selectionAsync().catch(() => undefined);
    },
    [setHeading, world]
  );

  const dropBeacon = useCallback(
    (point?: { x: number; y: number }) => {
      if (!world) return;
      const ahead = projectPoint(world.submarine.position.x, world.submarine.position.y, world.submarine.heading, 10);
      const beacon = {
        id: `beacon-${Date.now()}`,
        x: point?.x ?? ahead.x,
        y: point?.y ?? ahead.y,
        deployedAt: Date.now(),
      } satisfies ProbeBeacon;
      setLocalBeacons((prev) => [...prev, beacon]);
      revealAround(beacon.x, beacon.y, 2);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    },
    [revealAround, world]
  );

  const handleMapPress = useCallback(
    (event: any) => {
      if (!world || !navigation || !canvasRef.current || viewMode !== 'chart') return;
      const rect = canvasRef.current.getBoundingClientRect();
      const px = (event.clientX - rect.left) * (canvasRef.current.width / rect.width);
      const py = (event.clientY - rect.top) * (canvasRef.current.height / rect.height);
      const point = screenToWorld(px, py, canvasRef.current.width, canvasRef.current.height, world);
      const hit = findNearestWaypoint(navigation.waypoints, point.x, point.y, 4.2);

      if (toolMode === 'beacon') {
        dropBeacon(point);
        return;
      }

      if (toolMode === 'discover') {
        revealAround(point.x, point.y, 3);
        return;
      }

      if (hit) {
        plotWaypoint(hit);
        return;
      }

      const nextHeading = bearingBetween(world.submarine.position.x, world.submarine.position.y, point.x, point.y);
      setHeading(nextHeading);
      if (steeringMode === 'auto' && toolMode === 'plot') {
        const waypoint = {
          id: `plot-${Date.now()}`,
          x: point.x,
          y: point.y,
          type: 'poi',
          label: 'PLOT',
          reached: false,
        } satisfies NavWaypoint;
        setLocalWaypoints((prev) => [...prev, waypoint]);
        setCourseIds((prev) => [...prev, waypoint.id]);
        setSelectedWaypointId(waypoint.id);
      }
      void Haptics.selectionAsync().catch(() => undefined);
    },
    [dropBeacon, navigation, plotWaypoint, revealAround, setHeading, steeringMode, toolMode, viewMode, world]
  );

  const engageCourse = useCallback(() => {
    if (!world || !navigation || steeringMode !== 'auto') return;
    const next = navigation.currentCourse
      .map((id) => navigation.waypoints.find((waypoint) => waypoint.id === id))
      .find((waypoint): waypoint is NavWaypoint => !!waypoint && !waypoint.reached);
    if (next) {
      plotWaypoint(next);
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined);
  }, [navigation, plotWaypoint, steeringMode, world]);

  const handleBallast = useCallback(
    (action: 'flood' | 'blow') => {
      if (!world) return;
      const delta = action === 'flood' ? 0.12 : -0.12;
      const nextFwd = clamp(fwdTankRef.current + delta, 0.18, 0.9);
      const nextAft = clamp(aftTankRef.current + delta, 0.18, 0.9);
      const depthDelta = action === 'flood' ? 25 : -25;
      const nextDepth = clamp(world.submarine.depth + depthDelta, 10, 320);
      setFwdTank(nextFwd);
      setAftTank(nextAft);
      setBallastAction(action);
      setTargetDepth(nextDepth);
      setDepth(Math.round(nextDepth));
      setTimeout(() => setBallastAction('idle'), 1300);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    },
    [setDepth, world]
  );

  const handleJoystickMove = useCallback(
    (event: GestureResponderEvent) => {
      if (!world || steeringMode !== 'helm') return;
      const x = clamp((event.nativeEvent.locationX - 60) / 54, -1, 1);
      const y = clamp((event.nativeEvent.locationY - 60) / 54, -1, 1);
      setJoystick({ active: true, x, y });

      const turn = x * 7;
      const nextHeading = normalizeBearing(world.submarine.heading + turn);
      setHeading(nextHeading);

      if (y < -0.55 && world.submarine.speed !== 'FULL') setSpeed('FULL');
      else if (y < -0.2 && world.submarine.speed !== '2/3') setSpeed('2/3');
      else if (y > 0.45 && world.submarine.speed !== '1/3') setSpeed('1/3');
    },
    [setHeading, setSpeed, steeringMode, world]
  );

  const releaseJoystick = useCallback(() => {
    setJoystick((prev) => ({ ...prev, active: false, x: 0, y: 0 }));
  }, []);

  if (!world || !navigation) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Awaiting navigation feed</Text>
      </View>
    );
  }

  const sub = world.submarine;
  const trim = Math.round((fwdTank - aftTank) * 22);
  const buoyancy = buoyancyLabel(fwdTank, aftTank);
  const scopeReady = sub.depth < 20;
  const terrainLabel = currentTerrain?.label ?? 'OPEN WATER';
  const throttleLabel = speedLabel(sub.speed);

  return (
    <View style={styles.root}>
      <View style={styles.topRail}>
        <View style={styles.tabsGroup}>
          <ModeTab label="CHART" active={viewMode === 'chart'} onPress={() => setViewMode('chart')} />
          <ModeTab label="DEPTH" active={viewMode === 'depth'} onPress={() => setViewMode('depth')} />
          <ModeTab label="SONAR" active={viewMode === 'sonar'} onPress={() => setViewMode('sonar')} />
        </View>
        <Text numberOfLines={1} style={styles.terrainReadout}>{terrainLabel}</Text>
        <View style={styles.scopeBadge}>
          <View style={[styles.scopeLight, scopeReady && styles.scopeLightReady]} />
          <Text style={[styles.scopeText, scopeReady && styles.scopeTextReady]}>SCOPE</Text>
        </View>
        {currentZone && <Text style={styles.currentReadout}>CURRENT {formatBearing(currentZone.direction)}</Text>}
        <View style={styles.steeringToggle}>
          <TouchableOpacity
            style={[styles.toggleHalf, steeringMode === 'auto' && styles.toggleHalfActive]}
            onPress={() => setSteeringMode('auto')}
          >
            <Text style={[styles.toggleText, steeringMode === 'auto' && styles.toggleTextActive]}>AUTO</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleHalf, steeringMode === 'helm' && styles.toggleHalfActive]}
            onPress={() => setSteeringMode('helm')}
          >
            <Text style={[styles.toggleText, steeringMode === 'helm' && styles.toggleTextActive]}>HELM</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.headingReadout}>
          <Text style={styles.headingText}>{formatBearing(sub.heading)}</Text>
          <Text style={styles.headingSub}>{compassShort(sub.heading)}</Text>
        </View>
      </View>

      <View style={styles.mainRow}>
        <View style={styles.speedRail}>
          <Text style={styles.verticalLabel}>SPEED</Text>
          <View style={styles.speedStack}>
            {SPEEDS.map((speed) => {
              const active = sub.speed === speed;
              const color = SPEED_COLORS[speed];
              return (
                <TouchableOpacity
                  key={speed}
                  style={[
                    styles.speedButton,
                    { borderColor: active ? color : hexToRgba(color, 0.2) },
                    active && { backgroundColor: hexToRgba(color, 0.14) },
                  ]}
                  activeOpacity={0.84}
                  onPress={() => {
                    setSpeed(speed);
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
                  }}
                >
                  <Text style={[styles.speedButtonText, { color: active ? color : UI.muted }]}>{speed}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={styles.speedReadout}>
            <Text numberOfLines={2} style={styles.speedTitle}>{throttleLabel}</Text>
            <Text style={styles.speedEta}>ETA {eta}</Text>
          </View>
        </View>

        <View style={styles.viewFrame}>
          {IS_WEB_RUNTIME ? (
            <canvas
              ref={(node) => {
                canvasRef.current = node as HTMLCanvasElement | null;
              }}
              onClick={handleMapPress}
              style={{ display: 'block', width: '100%', height: '100%', cursor: steeringMode === 'helm' ? 'default' : 'crosshair' } as any}
            />
          ) : (
            <NativeFallback world={world} navigation={navigation} viewMode={viewMode} />
          )}

          {viewMode === 'chart' && steeringMode === 'helm' && (
            <View
              style={styles.joystickZone}
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
              onResponderGrant={handleJoystickMove}
              onResponderMove={handleJoystickMove}
              onResponderRelease={releaseJoystick}
              onResponderTerminate={releaseJoystick}
            >
              <View style={styles.joystickRing}>
                <View style={styles.joystickCrossV} />
                <View style={styles.joystickCrossH} />
                <View
                  style={[
                    styles.joystickThumb,
                    {
                      transform: [
                        { translateX: joystick.x * 34 },
                        { translateY: joystick.y * 34 },
                      ],
                    },
                  ]}
                />
              </View>
            </View>
          )}
        </View>

        <View style={styles.ballastRail}>
          <Text style={styles.panelTitle}>BALLAST</Text>
          <BallastDiagram
            fwdTank={fwdTank}
            aftTank={aftTank}
            trim={trim}
            action={ballastAction}
          />
          <View style={styles.ballastButtons}>
            <TouchableOpacity
              style={[styles.ballastButton, { borderColor: UI.blue }]}
              onPress={() => handleBallast('flood')}
              activeOpacity={0.84}
            >
              <Text style={[styles.ballastButtonText, { color: UI.blue }]}>FLOOD</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.ballastButton, { borderColor: UI.green }]}
              onPress={() => handleBallast('blow')}
              activeOpacity={0.84}
            >
              <Text style={[styles.ballastButtonText, { color: UI.green }]}>BLOW</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.ballastMetrics}>
            <Metric label="DEPTH" value={`${Math.round(sub.depth)}m`} color={UI.blue} />
            <Metric label="TRIM" value={`${trim > 0 ? 'DN' : trim < 0 ? 'UP' : 'LVL'} ${Math.abs(trim)}`} color={UI.teal} />
            <Metric label="BUOY" value={buoyancy} color={buoyancy === 'NEGATIVE' ? UI.blue : buoyancy === 'POSITIVE' ? UI.green : UI.teal} />
          </View>
        </View>
      </View>

      <View style={styles.bottomDock}>
        <DockButton label="PLOT" color={UI.teal} active={toolMode === 'plot'} dimmed={steeringMode === 'helm'} onPress={() => setToolMode('plot')} />
        <DockButton label="BEACON" color={UI.amber} active={toolMode === 'beacon'} dimmed={false} onPress={() => setToolMode('beacon')} />
        <DockButton label="DISCOVER" color={UI.green} active={toolMode === 'discover'} dimmed={steeringMode === 'helm'} onPress={() => setToolMode('discover')} />
        <TouchableOpacity
          style={[styles.engageButton, steeringMode === 'helm' && styles.engageButtonDim]}
          activeOpacity={0.84}
          disabled={steeringMode === 'helm'}
          onPress={engageCourse}
        >
          <View style={styles.engageGlyph} />
          <Text style={styles.engageText}>ENGAGE COURSE</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function BallastDiagram({
  fwdTank,
  aftTank,
  trim,
  action,
}: {
  fwdTank: number;
  aftTank: number;
  trim: number;
  action: BallastAction;
}) {
  const bubbles = action === 'blow';
  return (
    <View style={styles.ballastDiagram}>
      <View style={styles.subOutline}>
        <View style={styles.subNose} />
        <View style={styles.subTail} />
        <Tank label="FWD" fill={fwdTank} bubbles={bubbles} />
        <View style={styles.trimIndicator}>
          <View style={[styles.trimNeedle, { transform: [{ rotate: `${trim * 2}deg` }] }]} />
        </View>
        <Tank label="AFT" fill={aftTank} bubbles={bubbles} />
      </View>
    </View>
  );
}

function Tank({ label, fill, bubbles }: { label: string; fill: number; bubbles: boolean }) {
  return (
    <View style={styles.tank}>
      <View style={[styles.tankWater, { height: `${clamp(fill, 0, 1) * 100}%` as any }]}>
        <View style={styles.tankWave} />
      </View>
      {bubbles && (
        <>
          <View style={[styles.bubble, styles.bubbleOne]} />
          <View style={[styles.bubble, styles.bubbleTwo]} />
          <View style={[styles.bubble, styles.bubbleThree]} />
        </>
      )}
      <Text style={styles.tankLabel}>{label}</Text>
    </View>
  );
}

function ModeTab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.modeTab, active && styles.modeTabActive]} onPress={onPress} activeOpacity={0.82}>
      <Text style={[styles.modeTabText, active && styles.modeTabTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function DockButton({
  label,
  color,
  active,
  dimmed,
  onPress,
}: {
  label: string;
  color: string;
  active: boolean;
  dimmed: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.dockButton,
        active && { borderColor: color, backgroundColor: hexToRgba(color, 0.12) },
        dimmed && styles.dockButtonDim,
      ]}
      disabled={dimmed}
      activeOpacity={0.82}
      onPress={onPress}
    >
      <View style={[styles.dockGlyph, { borderColor: color }]}> 
        <View style={[styles.dockGlyphCore, { backgroundColor: color }]} />
      </View>
      <Text style={[styles.dockText, { color: active ? color : UI.muted }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text numberOfLines={1} style={[styles.metricValue, { color }]}>{value}</Text>
    </View>
  );
}

function NativeFallback({
  world,
  navigation,
  viewMode,
}: {
  world: World;
  navigation: NavigationData;
  viewMode: ViewMode;
}) {
  return (
    <View style={styles.nativeFallback}>
      <Text style={styles.nativeMode}>{viewMode.toUpperCase()}</Text>
      <View style={[styles.nativeSub, { transform: [{ rotate: `${world.submarine.heading}deg` }] }]} />
      {navigation.waypoints.slice(0, 5).map((waypoint) => {
        const p = nativePercent(waypoint.x, waypoint.y, world.submarine.position.x, world.submarine.position.y);
        return (
          <View
            key={waypoint.id}
            style={[
              styles.nativeWaypoint,
              {
                left: `${p.x}%` as any,
                top: `${p.y}%` as any,
                backgroundColor: waypointColor(waypoint.type),
              },
            ]}
          />
        );
      })}
    </View>
  );
}

function fitCanvasToParent(canvas: HTMLCanvasElement) {
  const parent = canvas.parentElement;
  if (!parent) return;

  const rect = parent.getBoundingClientRect();
  const width = Math.max(180, Math.floor(rect.width));
  const height = Math.max(140, Math.floor(rect.height));
  const ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const nextWidth = Math.floor(width * ratio);
  const nextHeight = Math.floor(height * ratio);

  if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
    canvas.width = nextWidth;
    canvas.height = nextHeight;
  }
}

function drawChart(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  args: {
    world: World;
    navigation: NavigationData;
    selectedWaypointId: string | null;
    visitedCells: Record<string, boolean>;
    targetDepth: number;
    time: number;
  }
) {
  const { world, navigation, selectedWaypointId, visitedCells, time } = args;
  const sub = world.submarine;
  const scale = Math.min(width, height) / (MAP_KM_RADIUS * 2);

  ctx.clearRect(0, 0, width, height);
  drawOceanBackdrop(ctx, width, height, time);
  drawIslandAndShallows(ctx, width, height, sub, scale, time);
  drawGrid(ctx, width, height, sub.position.x, sub.position.y, scale);
  drawDepthZones(ctx, width, height, sub, scale, time);
  drawNorthAtlanticChannel(ctx, width, height, sub, scale, time);
  drawTerrainRegions(ctx, width, height, sub, scale, navigation.terrain, time);
  drawContourLines(ctx, width, height, sub, scale, time);
  drawCurrents(ctx, width, height, sub, scale, navigation.currents, time);
  drawMarineSilhouettes(ctx, width, height, sub, scale, time);
  drawProjectedHeading(ctx, width, height, sub, scale);
  drawCourse(ctx, width, height, sub, scale, navigation);
  drawWaypoints(ctx, width, height, sub, scale, navigation, selectedWaypointId, time);
  drawFog(ctx, width, height, sub, scale, visitedCells, navigation.fogOfWar, time);
  drawCompassRose(ctx, width - 56, 56, sub.heading, 30);
  drawMiniSonar(ctx, 18, height - 138, 120, world, time);
  drawSubmarineIcon(ctx, width / 2, height / 2, sub.heading, 1.35, time);
  drawMapLabels(ctx, width, height);
  drawMapRim(ctx, width, height);
}

function drawDepthProfile(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  world: World,
  navigation: NavigationData,
  targetDepth: number,
  time: number
) {
  const sub = world.submarine;
  ctx.clearRect(0, 0, width, height);
  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, '#03161d');
  bg.addColorStop(0.38, '#03101a');
  bg.addColorStop(1, '#020508');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const left = 54;
  const right = width - 24;
  const top = 28;
  const bottom = height - 42;
  const plotW = right - left;
  const plotH = bottom - top;

  ctx.strokeStyle = 'rgba(77,255,174,0.1)';
  ctx.lineWidth = 1;
  for (let d = 0; d <= MAX_PROFILE_DEPTH; d += 60) {
    const y = top + (d / MAX_PROFILE_DEPTH) * plotH;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
    ctx.fillStyle = 'rgba(88,115,108,0.9)';
    ctx.font = '11px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${d}m`, left - 8, y + 4);
  }

  ctx.strokeStyle = hexToRgba(UI.blue, 0.5);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (let x = left; x <= right; x += 8) {
    const phase = (x - left) / plotW;
    const y = top + 7 + Math.sin(phase * Math.PI * 7 + time * 0.002) * 2;
    if (x === left) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  const floor: Array<{ x: number; y: number; depth: number }> = [];
  for (let i = 0; i <= 90; i += 1) {
    const dist = (i / 90) * PROFILE_DISTANCE_KM;
    const sample = projectPoint(sub.position.x, sub.position.y, sub.heading, dist * 8);
    const terrain = terrainAt(navigation.terrain, sample.x, sample.y);
    const baseDepth = terrain?.depth ?? 230;
    const canyon = Math.sin(dist * 2.2 + sub.position.x * 0.08) * 50 + Math.sin(dist * 5.1) * 20;
    const depth = clamp(baseDepth + canyon, 55, MAX_PROFILE_DEPTH);
    floor.push({ x: left + (i / 90) * plotW, y: top + (depth / MAX_PROFILE_DEPTH) * plotH, depth });
  }

  ctx.beginPath();
  ctx.moveTo(left, bottom);
  floor.forEach((point, index) => {
    if (index === 0) ctx.lineTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.lineTo(right, bottom);
  ctx.closePath();
  const floorFill = ctx.createLinearGradient(0, top, 0, bottom);
  floorFill.addColorStop(0, 'rgba(10,61,61,0.18)');
  floorFill.addColorStop(0.45, 'rgba(0,229,204,0.12)');
  floorFill.addColorStop(1, 'rgba(2,5,8,0.92)');
  ctx.fillStyle = floorFill;
  ctx.fill();

  ctx.strokeStyle = hexToRgba(UI.teal, 0.44);
  ctx.lineWidth = 2;
  ctx.beginPath();
  floor.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.stroke();

  const targetY = top + (clamp(targetDepth, 0, MAX_PROFILE_DEPTH) / MAX_PROFILE_DEPTH) * plotH;
  const currentY = top + (clamp(sub.depth, 0, MAX_PROFILE_DEPTH) / MAX_PROFILE_DEPTH) * plotH;
  ctx.save();
  ctx.setLineDash([6, 8]);
  ctx.strokeStyle = hexToRgba(UI.teal, 0.65);
  ctx.beginPath();
  ctx.moveTo(left, targetY);
  ctx.lineTo(right, targetY);
  ctx.stroke();
  ctx.restore();

  ctx.strokeStyle = hexToRgba(UI.blue, 0.8);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(left, currentY);
  ctx.lineTo(right, currentY);
  ctx.stroke();

  const nearestFloor = floor[5]?.depth ?? 250;
  if (nearestFloor - sub.depth < 45) {
    ctx.fillStyle = 'rgba(255,98,93,0.12)';
    ctx.fillRect(left, currentY - 24, plotW, 48);
  }

  drawSubProfileIcon(ctx, left + 28, currentY, time);

  ctx.fillStyle = UI.teal;
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('DEPTH PROFILE', left, 18);
  ctx.fillStyle = UI.muted;
  ctx.font = '11px monospace';
  ctx.fillText('0km', left, height - 16);
  ctx.fillText(`${PROFILE_DISTANCE_KM}km AHEAD`, right - 78, height - 16);
  drawMapRim(ctx, width, height);
}

function drawSonarRepeater(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  world: World,
  time: number,
  mini: boolean
) {
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * (mini ? 0.42 : 0.43);
  ctx.clearRect(0, 0, width, height);

  const bg = ctx.createRadialGradient(cx, cy, radius * 0.1, cx, cy, radius * 1.2);
  bg.addColorStop(0, '#073326');
  bg.addColorStop(0.55, '#031815');
  bg.addColorStop(1, '#020609');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();

  ctx.strokeStyle = hexToRgba(UI.green, mini ? 0.13 : 0.16);
  ctx.lineWidth = 1;
  [0.25, 0.5, 0.75, 1].forEach((scale) => {
    ctx.beginPath();
    ctx.arc(cx, cy, radius * scale, 0, Math.PI * 2);
    ctx.stroke();
  });
  for (let deg = 0; deg < 360; deg += 30) {
    const rad = (deg - 90) * (Math.PI / 180);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(rad) * radius, cy + Math.sin(rad) * radius);
    ctx.stroke();
  }

  const sweep = ((time * 0.025) % 360 - 90) * (Math.PI / 180);
  const trail = 50 * (Math.PI / 180);
  const sweepFill = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  sweepFill.addColorStop(0, 'rgba(77,255,174,0.42)');
  sweepFill.addColorStop(1, 'rgba(77,255,174,0.02)');
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, radius, sweep - trail, sweep);
  ctx.closePath();
  ctx.fillStyle = sweepFill;
  ctx.fill();
  ctx.strokeStyle = hexToRgba(UI.green, 0.86);
  ctx.lineWidth = mini ? 1.2 : 1.8;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(sweep) * radius, cy + Math.sin(sweep) * radius);
  ctx.stroke();

  const contacts = world.contacts.filter((contact) => contact.detected && !contact.destroyed);
  contacts.forEach((contact) => {
    drawSonarContact(ctx, cx, cy, radius, contact, world.submarine.heading, time, mini);
  });

  ctx.restore();
  drawSubmarineIcon(ctx, cx, cy, world.submarine.heading, mini ? 0.55 : 0.9, time);
  ctx.strokeStyle = hexToRgba(UI.green, 0.38);
  ctx.lineWidth = mini ? 1 : 2;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  if (!mini) {
    ctx.fillStyle = UI.teal;
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('SONAR REPEATER', 20, 24);
    drawMapRim(ctx, width, height);
  }
}

function drawMiniSonar(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, world: World, time: number) {
  ctx.save();
  ctx.translate(x, y);
  drawSonarRepeater(ctx, size, size, world, time, true);
  ctx.strokeStyle = hexToRgba(UI.green, 0.28);
  ctx.lineWidth = 1;
  roundRect(ctx, 0, 0, size, size, 8);
  ctx.stroke();
  ctx.fillStyle = 'rgba(215,255,242,0.68)';
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('SONAR', 8, 14);
  ctx.restore();
}

function drawOceanBackdrop(ctx: CanvasRenderingContext2D, width: number, height: number, time: number) {
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, '#07151c');
  bg.addColorStop(0.35, '#04131a');
  bg.addColorStop(1, '#020508');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(77,255,174,0.035)';
  for (let i = 0; i < 160; i += 1) {
    const x = (i * 113 + time * 0.015) % width;
    const y = (i * 67 + Math.sin(time * 0.0008 + i) * 15) % height;
    ctx.fillRect(x, y, 1.2, 1.2);
  }
}

function drawIslandAndShallows(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  sub: World['submarine'],
  scale: number,
  time: number
) {
  const island = [
    { x: -36, y: 18 }, { x: -30, y: 8 }, { x: -22, y: 4 }, { x: -16, y: 9 },
    { x: -17, y: 17 }, { x: -10, y: 26 }, { x: -22, y: 34 }, { x: -34, y: 31 },
    { x: -43, y: 25 },
  ];
  const points = island.map((p) => worldToScreen(p.x, p.y, width, height, sub, scale));

  ctx.fillStyle = 'rgba(10,61,61,0.32)';
  ctx.beginPath();
  points.forEach((p, index) => {
    if (index === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x + Math.sin(time * 0.0005 + index) * 1.5, p.y);
  });
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = hexToRgba(UI.teal, 0.38);
  ctx.stroke();

  ctx.fillStyle = 'rgba(174,158,106,0.72)';
  ctx.beginPath();
  points.forEach((p, index) => {
    const shrinkX = width / 2 + (p.x - width / 2) * 0.93;
    const shrinkY = height / 2 + (p.y - height / 2) * 0.93;
    if (index === 0) ctx.moveTo(shrinkX, shrinkY);
    else ctx.lineTo(shrinkX, shrinkY);
  });
  ctx.closePath();
  ctx.fill();
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  subX: number,
  subY: number,
  scale: number
) {
  const cell = 8 * scale;
  const xOffset = width / 2 - positiveModulo(subX * scale, cell);
  const yOffset = height / 2 - positiveModulo(subY * scale, cell);
  ctx.strokeStyle = 'rgba(77,255,174,0.065)';
  ctx.lineWidth = 1;
  for (let x = xOffset; x < width; x += cell) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = yOffset; y < height; y += cell) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

function drawDepthZones(ctx: CanvasRenderingContext2D, width: number, height: number, sub: World['submarine'], scale: number, time: number) {
  const zones = [
    { x: -22, y: 8, rx: 33, ry: 18, color: '#0a3d3d', alpha: 0.34 },
    { x: 8, y: -5, rx: 42, ry: 23, color: '#061a2e', alpha: 0.28 },
    { x: 28, y: -18, rx: 24, ry: 42, color: '#030d1a', alpha: 0.42 },
    { x: 16, y: 22, rx: 18, ry: 36, color: '#020508', alpha: 0.58 },
  ];
  zones.forEach((zone, index) => {
    const p = worldToScreen(zone.x, zone.y, width, height, sub, scale);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate((-22 + index * 18) * (Math.PI / 180));
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(zone.rx, zone.ry) * scale);
    gradient.addColorStop(0, hexToRgba(zone.color, zone.alpha + Math.sin(time * 0.0006 + index) * 0.03));
    gradient.addColorStop(1, hexToRgba(zone.color, 0));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(0, 0, zone.rx * scale, zone.ry * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}


function drawNorthAtlanticChannel(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  sub: World['submarine'],
  scale: number,
  time: number
) {
  const path = [
    { x: -54, y: 3 },
    { x: -30, y: 0 },
    { x: -10, y: -5 },
    { x: 8, y: -15 },
    { x: 24, y: -27 },
    { x: 45, y: -38 },
  ].map((point) => worldToScreen(point.x, point.y, width, height, sub, scale));

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.strokeStyle = 'rgba(1,5,8,0.9)';
  ctx.lineWidth = Math.max(22, 28 * scale);
  ctx.beginPath();
  path.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.stroke();

  ctx.strokeStyle = 'rgba(0,229,204,0.18)';
  ctx.lineWidth = Math.max(1, 2.3 * scale);
  for (let lane = -4; lane <= 4; lane += 1) {
    ctx.beginPath();
    path.forEach((point, index) => {
      const y = point.y + lane * 7 * scale + Math.sin(index + time * 0.0004) * 1.5;
      if (index === 0) ctx.moveTo(point.x, y);
      else ctx.lineTo(point.x, y);
    });
    ctx.stroke();
  }

  ctx.restore();

  const labelA = worldToScreen(20, -23, width, height, sub, scale);
  const labelB = worldToScreen(-12, -8, width, height, sub, scale);
  const labelC = worldToScreen(34, -33, width, height, sub, scale);
  drawRotatedChartLabel(ctx, 'TRENCH', labelA.x, labelA.y, -38, UI.teal, 11);
  drawRotatedChartLabel(ctx, 'OCEAN', labelB.x, labelB.y, -26, 'rgba(215,255,242,0.72)', 11);
  drawRotatedChartLabel(ctx, 'SUB OCEAN', labelC.x, labelC.y, -50, 'rgba(215,255,242,0.62)', 10);

  [
    { text: '290 m', x: 3, y: -12 },
    { text: '500 m', x: 18, y: -20 },
    { text: '730 m', x: 28, y: -30 },
    { text: '2500 m', x: 8, y: -34 },
  ].forEach((sound) => {
    const p = worldToScreen(sound.x, sound.y, width, height, sub, scale);
    ctx.fillStyle = hexToRgba(UI.teal, 0.74);
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(sound.text, p.x, p.y);
    ctx.strokeStyle = hexToRgba(UI.teal, 0.34);
    ctx.beginPath();
    ctx.moveTo(p.x - 17, p.y + 4);
    ctx.lineTo(p.x + 17, p.y + 4);
    ctx.stroke();
  });
}

function drawMarineSilhouettes(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  sub: World['submarine'],
  scale: number,
  time: number
) {
  const silhouettes = [
    { x: -44, y: -9, s: 0.8, a: -12 },
    { x: -4, y: -13, s: 0.65, a: 18 },
    { x: 19, y: 5, s: 0.9, a: -8 },
    { x: 34, y: 19, s: 1.15, a: -24 },
    { x: 43, y: -8, s: 0.7, a: 14 },
  ];

  silhouettes.forEach((shape, index) => {
    const p = worldToScreen(shape.x, shape.y, width, height, sub, scale);
    ctx.save();
    ctx.translate(p.x + Math.sin(time * 0.0004 + index) * 1.5, p.y);
    ctx.rotate(shape.a * (Math.PI / 180));
    ctx.scale(shape.s, shape.s);
    ctx.fillStyle = 'rgba(0,0,0,0.24)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 18, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(27, -7);
    ctx.lineTo(25, 0);
    ctx.lineTo(27, 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  });
}

function drawRotatedChartLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  angle: number,
  color: string,
  size: number
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle * (Math.PI / 180));
  ctx.fillStyle = color;
  ctx.font = `bold ${size}px monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function drawTerrainRegions(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  sub: World['submarine'],
  scale: number,
  terrain: TerrainRegion[],
  time: number
) {
  terrain.forEach((region) => {
    const p = worldToScreen(region.x, region.y, width, height, sub, scale);
    const rx = region.radiusX * scale;
    const ry = region.radiusY * scale;
    const color = terrainColor(region.type);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate((region.angle ?? 0) * (Math.PI / 180));
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(rx, ry));
    gradient.addColorStop(0, hexToRgba(color, 0.2));
    gradient.addColorStop(1, hexToRgba(color, 0.02));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = hexToRgba(color, 0.24 + Math.sin(time * 0.001 + region.depth) * 0.04);
    ctx.lineWidth = 1.2;
    for (let f = 0.35; f <= 1; f += 0.22) {
      ctx.beginPath();
      ctx.ellipse(0, 0, rx * f, ry * f, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    if (p.x > 40 && p.x < width - 40 && p.y > 36 && p.y < height - 36) {
      ctx.fillStyle = hexToRgba(color, 0.72);
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(region.label, p.x, p.y);
    }
  });
}

function drawContourLines(ctx: CanvasRenderingContext2D, width: number, height: number, sub: World['submarine'], scale: number, time: number) {
  const depths = [50, 100, 200, 500, 1000];
  depths.forEach((depth, index) => {
    const offset = index * 8 - 18;
    ctx.strokeStyle = index < 2 ? 'rgba(0,229,204,0.27)' : 'rgba(67,183,255,0.17)';
    ctx.lineWidth = index < 2 ? 1.4 : 1;
    ctx.beginPath();
    for (let i = -8; i <= 100; i += 1) {
      const wx = sub.position.x - 48 + i;
      const wy = sub.position.y + offset + Math.sin((wx + time * 0.00008) * 0.2 + index) * (4 + index * 0.8);
      const p = worldToScreen(wx, wy, width, height, sub, scale);
      if (i === -8) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();

    const labelP = worldToScreen(sub.position.x - 20 + index * 12, sub.position.y + offset, width, height, sub, scale);
    if (labelP.x > 20 && labelP.x < width - 20 && labelP.y > 20 && labelP.y < height - 20) {
      ctx.fillStyle = index < 2 ? UI.teal : UI.blue;
      ctx.font = 'bold 11px monospace';
      ctx.fillText(`${depth}m`, labelP.x, labelP.y - 4);
    }
  });
}

function drawCurrents(ctx: CanvasRenderingContext2D, width: number, height: number, sub: World['submarine'], scale: number, currents: CurrentRegion[], time: number) {
  currents.forEach((current) => {
    const center = worldToScreen(current.x, current.y, width, height, sub, scale);
    const radius = current.radius * scale;
    const dir = (current.direction - 90) * (Math.PI / 180);
    const dx = Math.cos(dir);
    const dy = Math.sin(dir);
    const phase = (time * 0.00025 * current.strength) % 1;
    ctx.strokeStyle = hexToRgba(UI.teal, 0.2 + current.strength * 0.05);
    ctx.lineWidth = 1.4;
    for (let lane = -2; lane <= 2; lane += 1) {
      const offset = lane * radius * 0.17;
      const px = center.x - dy * offset;
      const py = center.y + dx * offset;
      ctx.beginPath();
      for (let step = -8; step <= 8; step += 1) {
        const t = step / 8;
        const drift = (phase - 0.5) * 28;
        const x = px + dx * radius * t + drift * dx;
        const y = py + dy * radius * t + Math.sin(t * Math.PI * 2 + time * 0.002) * 5;
        if (step === -8) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  });
}

function drawProjectedHeading(ctx: CanvasRenderingContext2D, width: number, height: number, sub: World['submarine'], scale: number) {
  const end = projectPoint(sub.position.x, sub.position.y, sub.heading, 34);
  const p = worldToScreen(end.x, end.y, width, height, sub, scale);
  ctx.save();
  ctx.setLineDash([8, 10]);
  ctx.strokeStyle = hexToRgba(UI.green, 0.46);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(width / 2, height / 2);
  ctx.lineTo(p.x, p.y);
  ctx.stroke();
  ctx.restore();
}

function drawCourse(ctx: CanvasRenderingContext2D, width: number, height: number, sub: World['submarine'], scale: number, navigation: NavigationData) {
  const route = navigation.currentCourse
    .map((id) => navigation.waypoints.find((waypoint) => waypoint.id === id))
    .filter((waypoint): waypoint is NavWaypoint => !!waypoint);
  if (!route.length) return;
  ctx.save();
  ctx.setLineDash([4, 9]);
  ctx.strokeStyle = hexToRgba(UI.teal, 0.72);
  ctx.lineWidth = 2;
  ctx.shadowColor = UI.teal;
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.moveTo(width / 2, height / 2);
  route.forEach((waypoint) => {
    const p = worldToScreen(waypoint.x, waypoint.y, width, height, sub, scale);
    ctx.lineTo(p.x, p.y);
  });
  ctx.stroke();
  ctx.restore();
}

function drawWaypoints(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  sub: World['submarine'],
  scale: number,
  navigation: NavigationData,
  selectedWaypointId: string | null,
  time: number
) {
  navigation.beacons.forEach((beacon) => {
    const p = worldToScreen(beacon.x, beacon.y, width, height, sub, scale);
    const age = (Date.now() - beacon.deployedAt) * 0.001;
    const pulse = 7 + ((age * 18) % 18);
    ctx.strokeStyle = hexToRgba(UI.amber, Math.max(0, 0.55 - pulse / 44));
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = UI.amber;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  });

  navigation.waypoints.forEach((waypoint) => {
    const p = worldToScreen(waypoint.x, waypoint.y, width, height, sub, scale);
    if (p.x < -40 || p.x > width + 40 || p.y < -40 || p.y > height + 40) return;
    const color = waypointColor(waypoint.type);
    const selected = waypoint.id === selectedWaypointId;
    const pulse = 1 + Math.sin(time * 0.004 + waypoint.x) * 0.18;
    ctx.shadowColor = color;
    ctx.shadowBlur = selected ? 18 : 10;
    ctx.strokeStyle = hexToRgba(color, selected ? 0.85 : 0.48);
    ctx.lineWidth = selected ? 2 : 1.2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, (selected ? 13 : 9) * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = color;
    if (waypoint.type === 'objective') drawDiamond(ctx, p.x, p.y, 6);
    else if (waypoint.type === 'harbor') ctx.fillRect(p.x - 4.5, p.y - 4.5, 9, 9);
    else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  });
}

function drawFog(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  sub: World['submarine'],
  scale: number,
  visitedCells: Record<string, boolean>,
  fogOfWar: FogCell[],
  time: number
) {
  const fogMap = new Map(fogOfWar.map((cell) => [cellKey(cell.x, cell.y), cell.visited]));
  const minX = Math.floor((sub.position.x - MAP_KM_RADIUS) / FOG_CELL_KM) - 1;
  const maxX = Math.ceil((sub.position.x + MAP_KM_RADIUS) / FOG_CELL_KM) + 1;
  const minY = Math.floor((sub.position.y - MAP_KM_RADIUS) / FOG_CELL_KM) - 1;
  const maxY = Math.ceil((sub.position.y + MAP_KM_RADIUS) / FOG_CELL_KM) + 1;
  for (let gx = minX; gx <= maxX; gx += 1) {
    for (let gy = minY; gy <= maxY; gy += 1) {
      const key = cellKey(gx, gy);
      const visited = visitedCells[key] || fogMap.get(key);
      if (visited) continue;
      const p = worldToScreen(gx * FOG_CELL_KM + FOG_CELL_KM / 2, gy * FOG_CELL_KM + FOG_CELL_KM / 2, width, height, sub, scale);
      const size = FOG_CELL_KM * scale + 3;
      const alpha = 0.42 + Math.sin(time * 0.0008 + gx * 2.1 + gy) * 0.04;
      ctx.fillStyle = `rgba(0,4,7,${alpha})`;
      ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
      ctx.fillStyle = 'rgba(21,42,44,0.16)';
      ctx.beginPath();
      ctx.arc(p.x + Math.sin(time * 0.0006 + gx) * 8, p.y, size * 0.42, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawCompassRose(ctx: CanvasRenderingContext2D, x: number, y: number, heading: number, radius: number) {
  ctx.strokeStyle = hexToRgba(UI.green, 0.34);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
  for (let deg = 0; deg < 360; deg += 45) {
    const rad = (deg - heading - 90) * (Math.PI / 180);
    const inner = deg % 90 === 0 ? radius * 0.33 : radius * 0.55;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(rad) * inner, y + Math.sin(rad) * inner);
    ctx.lineTo(x + Math.cos(rad) * radius, y + Math.sin(rad) * radius);
    ctx.stroke();
  }
  ctx.fillStyle = UI.teal;
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('N', x, y - radius - 6);
}

function drawSubmarineIcon(ctx: CanvasRenderingContext2D, x: number, y: number, heading: number, scale: number, time: number) {
  const rad = (heading - 90) * (Math.PI / 180);
  const pulse = 0.5 + Math.sin(time * 0.004) * 0.15;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rad);
  ctx.shadowColor = UI.teal;
  ctx.shadowBlur = 18 * scale;
  ctx.fillStyle = UI.teal;
  ctx.beginPath();
  ctx.moveTo(18 * scale, 0);
  ctx.lineTo(-13 * scale, -9 * scale);
  ctx.lineTo(-8 * scale, 0);
  ctx.lineTo(-13 * scale, 9 * scale);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = hexToRgba(UI.green, pulse);
  ctx.lineWidth = 1.4 * scale;
  ctx.beginPath();
  ctx.arc(0, 0, 25 * scale, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawSubProfileIcon(ctx: CanvasRenderingContext2D, x: number, y: number, time: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.shadowColor = UI.teal;
  ctx.shadowBlur = 14;
  ctx.fillStyle = UI.teal;
  ctx.beginPath();
  ctx.ellipse(0, 0, 20, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(-2, -15, 7, 10);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = hexToRgba(UI.green, 0.24 + Math.sin(time * 0.004) * 0.08);
  ctx.beginPath();
  ctx.arc(0, 0, 30, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawSonarContact(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  contact: Contact,
  heading: number,
  time: number,
  mini: boolean
) {
  const offset = bearingRangeToOffset(normalizeBearing(contact.bearing - heading), clamp(contact.range, 0.025, 0.96));
  const x = cx + offset.x * radius;
  const y = cy + offset.y * radius;
  const color = contact.color || (contact.identified ? UI.red : UI.amber);
  if (contact.style === 'pulse-slow') {
    const t = time * 0.00022;
    for (let i = 0; i < 3; i += 1) {
      const phase = (t + i * 0.33) % 1;
      ctx.strokeStyle = `rgba(0,229,204,${(1 - phase) * 0.42})`;
      ctx.lineWidth = mini ? 0.8 : 1.2;
      ctx.beginPath();
      ctx.arc(x, y, (mini ? 2 : 4) + phase * (mini ? 13 : 25), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = UI.teal;
    ctx.beginPath();
    ctx.arc(x, y, mini ? 2.5 : 4, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const pulse = 0.5 + Math.sin(time * 0.006 + contact.id) * 0.5;
  ctx.shadowColor = color;
  ctx.shadowBlur = mini ? 6 : 14;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, mini ? 2.5 : 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = hexToRgba(color, 0.42);
  ctx.beginPath();
  ctx.arc(x, y, (mini ? 5 : 9) + pulse * 4, 0, Math.PI * 2);
  ctx.stroke();
}

function drawMapLabels(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.fillStyle = 'rgba(215,255,242,0.88)';
  ctx.font = 'bold 19px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('NORTH ATLANTIC', 20, 31);

  ctx.fillStyle = 'rgba(215,255,242,0.62)';
  ctx.font = 'bold 10px monospace';
  ctx.fillText('METER DEPTH SOUNDING', 21, 54);
  ctx.strokeStyle = 'rgba(215,255,242,0.58)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(22, 69);
  ctx.lineTo(122, 69);
  ctx.stroke();
  [22, 55, 88, 122].forEach((x) => {
    ctx.beginPath();
    ctx.moveTo(x, 64);
    ctx.lineTo(x, 74);
    ctx.stroke();
  });
  ctx.fillStyle = 'rgba(215,255,242,0.56)';
  ctx.font = '9px monospace';
  ['50', '100', '300', '1000'].forEach((label, index) => {
    ctx.fillText(label, 17 + index * 33, 88);
  });

  const legendW = 170;
  const legendH = 80;
  const lx = width - legendW - 20;
  const ly = height - legendH - 22;
  ctx.fillStyle = 'rgba(2,8,11,0.64)';
  roundRect(ctx, lx, ly, legendW, legendH, 5);
  ctx.fill();
  ctx.strokeStyle = 'rgba(215,255,242,0.35)';
  ctx.stroke();
  ctx.fillStyle = 'rgba(215,255,242,0.78)';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('EXTREME DEPTH ZONES', lx + legendW / 2, ly + 18);

  [
    { color: UI.teal, label: '50-200m' },
    { color: UI.blue, label: '200-500m' },
    { color: '#020508', label: 'ABYSS' },
  ].forEach((row, index) => {
    const y = ly + 34 + index * 14;
    ctx.fillStyle = row.color;
    ctx.fillRect(lx + 22, y, 42, 6);
    ctx.strokeStyle = hexToRgba(UI.teal, 0.32);
    ctx.strokeRect(lx + 22, y, 42, 6);
    ctx.fillStyle = 'rgba(215,255,242,0.58)';
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(row.label, lx + 78, y + 7);
  });

  ctx.fillStyle = 'rgba(88,115,108,0.72)';
  ctx.font = '10px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('40N / 052W', width - 112, height - 8);
}

function drawMapRim(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.strokeStyle = hexToRgba(UI.green, 0.24);
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, width - 2, height - 2);
  ctx.strokeStyle = hexToRgba(UI.teal, 0.12);
  ctx.lineWidth = 1;
  ctx.strokeRect(12, 12, width - 24, height - 24);
}

function mergeNavigation(
  world: World,
  base: NavigationData,
  courseIds: string[],
  localWaypoints: NavWaypoint[],
  localBeacons: ProbeBeacon[]
): NavigationData {
  const incoming = (world as NavWorld).navigation;
  return {
    waypoints: [...(incoming?.waypoints ?? base.waypoints), ...localWaypoints],
    currentCourse: courseIds.length ? courseIds : incoming?.currentCourse ?? base.currentCourse,
    terrain: incoming?.terrain ?? base.terrain,
    currents: incoming?.currents ?? base.currents,
    fogOfWar: incoming?.fogOfWar ?? base.fogOfWar,
    beacons: [...(incoming?.beacons ?? base.beacons), ...localBeacons],
  };
}

function createMockNavigation(x: number, y: number): NavigationData {
  return {
    waypoints: [
      { id: 'obj-01', x: x + 26, y: y - 16, type: 'objective', label: 'SIGNAL', reached: false },
      { id: 'safe-01', x: x - 26, y: y + 19, type: 'harbor', label: 'HARBOR', reached: false },
      { id: 'poi-01', x: x + 12, y: y + 24, type: 'poi', label: 'RIDGE', reached: false },
      { id: 'poi-02', x: x - 29, y: y - 10, type: 'poi', label: 'KELP', reached: false },
    ],
    currentCourse: ['obj-01'],
    terrain: [
      { id: 'shallows-a', x: x - 30, y: y + 17, radiusX: 22, radiusY: 15, type: 'shallows', depth: 50, label: 'SHALLOWS', angle: -12 },
      { id: 'ridge-a', x: x + 12, y: y + 8, radiusX: 22, radiusY: 6, type: 'ridge', depth: 160, label: 'RIDGE', angle: -18 },
      { id: 'trench-a', x: x + 24, y: y - 16, radiusX: 11, radiusY: 31, type: 'trench', depth: 520, label: 'TRENCH', angle: 24 },
      { id: 'kelp-a', x: x - 27, y: y - 9, radiusX: 13, radiusY: 10, type: 'kelp', depth: 44, label: 'KELP FOREST', angle: 6 },
      { id: 'canyon-a', x: x + 5, y: y - 24, radiusX: 10, radiusY: 28, type: 'canyon', depth: 260, label: 'CANYON', angle: -7 },
      { id: 'abyss-a', x: x + 32, y: y + 24, radiusX: 18, radiusY: 18, type: 'abyss', depth: 900, label: 'ABYSS' },
    ],
    currents: [
      { id: 'current-a', x: x + 12, y: y - 11, radius: 18, direction: 72, strength: 0.7 },
      { id: 'current-b', x: x - 21, y: y + 18, radius: 14, direction: 138, strength: 0.45 },
    ],
    fogOfWar: [],
    beacons: [],
  };
}

function findNearestWaypoint(waypoints: NavWaypoint[], x: number, y: number, maxDistance: number) {
  let best: NavWaypoint | null = null;
  let bestDistance = maxDistance;
  waypoints.forEach((waypoint) => {
    const distance = distanceKm(x, y, waypoint.x, waypoint.y);
    if (distance < bestDistance) {
      best = waypoint;
      bestDistance = distance;
    }
  });
  return best;
}

function terrainAt(terrain: TerrainRegion[], x: number, y: number) {
  return terrain.find((region) => {
    const dx = (x - region.x) / region.radiusX;
    const dy = (y - region.y) / region.radiusY;
    return dx * dx + dy * dy <= 1;
  }) ?? null;
}

function worldToScreen(x: number, y: number, width: number, height: number, sub: World['submarine'], scale: number) {
  return {
    x: width / 2 + (x - sub.position.x) * scale,
    y: height / 2 + (y - sub.position.y) * scale,
  };
}

function screenToWorld(px: number, py: number, width: number, height: number, world: World) {
  const scale = Math.min(width, height) / (MAP_KM_RADIUS * 2);
  return {
    x: world.submarine.position.x + (px - width / 2) / scale,
    y: world.submarine.position.y + (py - height / 2) / scale,
  };
}

function nativePercent(x: number, y: number, subX: number, subY: number) {
  return {
    x: clamp(50 + ((x - subX) / MAP_KM_RADIUS) * 42, 4, 96),
    y: clamp(50 + ((y - subY) / MAP_KM_RADIUS) * 42, 4, 96),
  };
}

function projectPoint(x: number, y: number, bearing: number, distance: number) {
  const rad = bearing * (Math.PI / 180);
  return {
    x: x + Math.sin(rad) * distance,
    y: y - Math.cos(rad) * distance,
  };
}

function bearingBetween(x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return normalizeBearing((Math.atan2(dx, -dy) * 180) / Math.PI);
}

function distanceKm(x1: number, y1: number, x2: number, y2: number) {
  return Math.hypot(x2 - x1, y2 - y1);
}

function speedToKms(speed: Speed) {
  switch (speed) {
    case '1/3':
      return 0.5;
    case '2/3':
      return 1;
    case 'FULL':
      return 2;
    case 'FLANK':
      return 3.5;
    case 'REVERSE':
      return 0.3;
    case 'STOP':
    default:
      return 0;
  }
}

function speedLabel(speed: Speed) {
  switch (speed) {
    case '1/3':
      return 'AHEAD 1/3';
    case '2/3':
      return 'AHEAD 2/3';
    case 'FULL':
      return 'FULL';
    default:
      return speed;
  }
}

function buoyancyLabel(fwd: number, aft: number) {
  const avg = (fwd + aft) / 2;
  if (avg > 0.61) return 'NEGATIVE';
  if (avg < 0.39) return 'POSITIVE';
  return 'NEUTRAL';
}

function waypointColor(type: WaypointType) {
  switch (type) {
    case 'objective':
      return UI.amber;
    case 'harbor':
      return UI.blue;
    case 'beacon':
      return UI.green;
    case 'poi':
    default:
      return UI.teal;
  }
}

function terrainColor(type: TerrainType) {
  switch (type) {
    case 'shallows':
      return '#0a3d3d';
    case 'ridge':
      return UI.blue;
    case 'trench':
      return UI.red;
    case 'kelp':
      return UI.green;
    case 'canyon':
      return UI.teal;
    case 'abyss':
      return '#020508';
    case 'open':
    default:
      return UI.muted;
  }
}

function compassShort(heading: number) {
  const labels = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return labels[Math.round(normalizeBearing(heading) / 45) % 8];
}

function formatBearing(value: number) {
  const bearing = Math.round(normalizeBearing(value)) % 360;
  return String(bearing).padStart(3, '0');
}

function normalizeBearing(value: number) {
  return ((value % 360) + 360) % 360;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function cellKey(x: number, y: number) {
  return `${x}:${y}`;
}

function positiveModulo(value: number, mod: number) {
  return ((value % mod) + mod) % mod;
}

function drawDiamond(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  ctx.beginPath();
  ctx.moveTo(x, y - radius);
  ctx.lineTo(x + radius, y);
  ctx.lineTo(x, y + radius);
  ctx.lineTo(x - radius, y);
  ctx.closePath();
  ctx.fill();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function hexToRgba(hex: string, alpha: number) {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return `rgba(77,255,174,${alpha})`;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    gap: 8,
    padding: 9,
    backgroundColor: UI.bg,
  },
  topRail: {
    height: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: UI.border,
    backgroundColor: UI.panel,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    overflow: 'hidden',
  },
  tabsGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  modeTab: {
    minWidth: 54,
    height: 28,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(77,255,174,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(2,8,11,0.42)',
  },
  modeTabActive: {
    borderColor: UI.teal,
    backgroundColor: 'rgba(0,229,204,0.12)',
  },
  modeTabText: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 9,
    lineHeight: 10,
    color: UI.muted,
    letterSpacing: 0,
  },
  modeTabTextActive: {
    color: UI.teal,
  },
  terrainReadout: {
    flex: 1,
    minWidth: 0,
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 11,
    color: UI.muted,
    letterSpacing: 0,
  },
  scopeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 7,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(77,255,174,0.12)',
  },
  scopeLight: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: UI.dim,
  },
  scopeLightReady: {
    backgroundColor: UI.green,
  },
  scopeText: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 8,
    color: UI.muted,
    letterSpacing: 0,
  },
  scopeTextReady: {
    color: UI.green,
  },
  currentReadout: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 9,
    color: UI.teal,
    letterSpacing: 0,
  },
  steeringToggle: {
    width: 116,
    height: 28,
    flexDirection: 'row',
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(77,255,174,0.16)',
    overflow: 'hidden',
  },
  toggleHalf: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleHalfActive: {
    backgroundColor: 'rgba(0,229,204,0.14)',
  },
  toggleText: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 8,
    color: UI.muted,
    letterSpacing: 0,
  },
  toggleTextActive: {
    color: UI.teal,
  },
  headingReadout: {
    minWidth: 76,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'flex-end',
    gap: 6,
  },
  headingText: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 16,
    lineHeight: 18,
    color: UI.teal,
    letterSpacing: 0,
  },
  headingSub: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 12,
    lineHeight: 14,
    color: UI.green,
    letterSpacing: 0,
  },
  mainRow: {
    flex: 1,
    minHeight: 0,
    flexDirection: 'row',
    gap: 8,
  },
  speedRail: {
    width: 78,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: UI.border,
    backgroundColor: UI.panel,
    padding: 8,
    alignItems: 'center',
  },
  verticalLabel: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 10,
    lineHeight: 13,
    color: UI.muted,
    letterSpacing: 0,
    textAlign: 'center',
  },
  speedStack: {
    flex: 1,
    width: '100%' as any,
    justifyContent: 'center',
    gap: 8,
  },
  speedButton: {
    minHeight: 42,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(2,8,11,0.52)',
  },
  speedButtonText: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 10,
    lineHeight: 11,
    letterSpacing: 0,
  },
  speedReadout: {
    width: '100%' as any,
    borderTopWidth: 1,
    borderTopColor: 'rgba(77,255,174,0.08)',
    paddingTop: 8,
    alignItems: 'center',
  },
  speedTitle: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 9,
    lineHeight: 11,
    color: UI.teal,
    letterSpacing: 0,
    textAlign: 'center',
  },
  speedEta: {
    marginTop: 3,
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 9,
    color: UI.muted,
    letterSpacing: 0,
  },
  viewFrame: {
    flex: 1,
    minWidth: 0,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(77,255,174,0.22)',
    overflow: 'hidden',
    backgroundColor: '#02080b',
  },
  joystickZone: {
    position: 'absolute',
    left: '50%' as any,
    bottom: 30,
    width: 120,
    height: 120,
    marginLeft: -60,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joystickRing: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 1,
    borderColor: 'rgba(0,229,204,0.35)',
    backgroundColor: 'rgba(2,8,11,0.52)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  joystickCrossV: {
    position: 'absolute',
    width: 1,
    height: 82,
    backgroundColor: 'rgba(0,229,204,0.18)',
  },
  joystickCrossH: {
    position: 'absolute',
    width: 82,
    height: 1,
    backgroundColor: 'rgba(0,229,204,0.18)',
  },
  joystickThumb: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: UI.teal,
    backgroundColor: 'rgba(0,229,204,0.28)',
  },
  ballastRail: {
    width: '24%' as any,
    maxWidth: 250,
    minWidth: 190,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: UI.border,
    backgroundColor: UI.panel,
    padding: 10,
    overflow: 'hidden',
  },
  panelTitle: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 12,
    lineHeight: 14,
    color: UI.muted,
    letterSpacing: 0,
    marginBottom: 8,
  },
  ballastDiagram: {
    height: 128,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,229,204,0.12)',
    backgroundColor: 'rgba(2,8,11,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subOutline: {
    width: '92%' as any,
    height: 74,
    borderRadius: 38,
    borderWidth: 1,
    borderColor: 'rgba(0,229,204,0.34)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 18,
  },
  subNose: {
    position: 'absolute',
    left: -2,
    width: 18,
    height: 50,
    borderTopLeftRadius: 40,
    borderBottomLeftRadius: 40,
    borderWidth: 1,
    borderColor: 'rgba(0,229,204,0.22)',
  },
  subTail: {
    position: 'absolute',
    right: -4,
    width: 20,
    height: 38,
    borderTopRightRadius: 40,
    borderBottomRightRadius: 40,
    borderWidth: 1,
    borderColor: 'rgba(0,229,204,0.22)',
  },
  tank: {
    width: 48,
    height: 58,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(67,183,255,0.34)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(2,8,11,0.52)',
  },
  tankWater: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(67,183,255,0.46)',
  },
  tankWave: {
    position: 'absolute',
    left: -8,
    right: -8,
    top: -3,
    height: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(0,229,204,0.34)',
  },
  tankLabel: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 10,
    color: UI.teal,
    letterSpacing: 0,
  },
  bubble: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: 'rgba(215,255,242,0.62)',
  },
  bubbleOne: {
    left: 12,
    bottom: 12,
  },
  bubbleTwo: {
    right: 11,
    bottom: 24,
  },
  bubbleThree: {
    left: 23,
    bottom: 36,
  },
  trimIndicator: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(0,229,204,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trimNeedle: {
    width: 20,
    height: 2,
    borderRadius: 2,
    backgroundColor: UI.teal,
  },
  ballastButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  ballastButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(2,8,11,0.52)',
  },
  ballastButtonText: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 9,
    lineHeight: 10,
    letterSpacing: 0,
  },
  ballastMetrics: {
    marginTop: 8,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minHeight: 28,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(77,255,174,0.07)',
  },
  metricLabel: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 10,
    color: UI.muted,
    letterSpacing: 0,
  },
  metricValue: {
    flex: 1,
    textAlign: 'right',
    fontFamily: 'Orbitron_700Bold',
    fontSize: 11,
    letterSpacing: 0,
  },
  bottomDock: {
    height: 58,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: UI.border,
    backgroundColor: UI.panel,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 10,
  },
  dockButton: {
    width: 84,
    height: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(77,255,174,0.16)',
    backgroundColor: 'rgba(2,8,11,0.45)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  dockButtonDim: {
    opacity: 0.32,
  },
  dockGlyph: {
    width: 17,
    height: 17,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dockGlyphCore: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  dockText: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 9,
    lineHeight: 10,
    letterSpacing: 0,
  },
  engageButton: {
    minWidth: 150,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: UI.teal,
    backgroundColor: 'rgba(0,229,204,0.12)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  engageButtonDim: {
    opacity: 0.32,
  },
  engageGlyph: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: UI.teal,
  },
  engageText: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 10,
    lineHeight: 11,
    color: UI.teal,
    letterSpacing: 0,
  },
  nativeFallback: {
    flex: 1,
    backgroundColor: '#031419',
    overflow: 'hidden',
  },
  nativeMode: {
    position: 'absolute',
    left: 16,
    top: 14,
    fontFamily: 'Orbitron_700Bold',
    fontSize: 12,
    color: UI.teal,
  },
  nativeSub: {
    position: 'absolute',
    left: '50%' as any,
    top: '50%' as any,
    width: 0,
    height: 0,
    marginLeft: -10,
    marginTop: -10,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderBottomWidth: 24,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: UI.teal,
  },
  nativeWaypoint: {
    position: 'absolute',
    width: 14,
    height: 14,
    marginLeft: -7,
    marginTop: -7,
    borderRadius: 7,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UI.bg,
  },
  emptyText: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 12,
    color: Colors.textDim,
    letterSpacing: 0,
  },
});
