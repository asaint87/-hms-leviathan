import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';

import { useGame } from '@/contexts/GameContext';
import { Colors } from '@/constants/Colors';
import { type Speed, type World, bearingLabel } from '@workspace/world';

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

type WaypointType = 'objective' | 'harbor' | 'poi' | 'beacon';
type TerrainType = 'ridge' | 'trench' | 'kelp' | 'shelf' | 'abyss';

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

type ToolMode = 'plot' | 'depth' | 'beacon' | 'discover';

const SPEEDS: Speed[] = ['STOP', '1/3', '2/3', 'FULL'];
const SPEED_COLORS: Record<Speed, string> = {
  STOP: UI.muted,
  '1/3': UI.green,
  '2/3': UI.amber,
  FULL: UI.red,
  FLANK: UI.red,
  REVERSE: UI.blue,
};

const DEPTH_MIN = 15;
const DEPTH_MAX = 300;
const MAP_KM_RADIUS = 34;
const FOG_CELL_KM = 6;

export function NavigatorStation() {
  const { world, setHeading, setDepth, setSpeed } = useGame();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const worldRef = useRef<World | null>(world);
  const navRef = useRef<NavigationData | null>(null);
  const frameRef = useRef(0);
  const depthTrackHeightRef = useRef(1);
  const [toolMode, setToolMode] = useState<ToolMode>('plot');
  const [targetDepth, setTargetDepth] = useState(world?.submarine.depth ?? 50);
  const [courseIds, setCourseIds] = useState<string[]>([]);
  const [localWaypoints, setLocalWaypoints] = useState<NavWaypoint[]>([]);
  const [localBeacons, setLocalBeacons] = useState<ProbeBeacon[]>([]);
  const [visitedCells, setVisitedCells] = useState<Record<string, boolean>>({});
  const [selectedWaypointId, setSelectedWaypointId] = useState<string | null>(null);

  useEffect(() => {
    worldRef.current = world;
    if (world && !navRef.current) {
      navRef.current = createMockNavigation(world.submarine.position.x, world.submarine.position.y);
      setCourseIds(navRef.current.currentCourse);
    }
  }, [world]);

  useEffect(() => {
    if (!world) return;
    setTargetDepth((prev) => (Math.abs(prev - world.submarine.depth) < 3 ? world.submarine.depth : prev));
  }, [world?.submarine.depth, world]);

  useEffect(() => {
    if (!world) return;
    const sub = world.submarine.position;
    const next: Record<string, boolean> = {};
    for (let gx = -1; gx <= 1; gx += 1) {
      for (let gy = -1; gy <= 1; gy += 1) {
        next[cellKey(Math.floor(sub.x / FOG_CELL_KM) + gx, Math.floor(sub.y / FOG_CELL_KM) + gy)] = true;
      }
    }
    setVisitedCells((prev) => ({ ...prev, ...next }));
  }, [world?.submarine.position.x, world?.submarine.position.y, world]);

  const navigation = useMemo(() => {
    if (!world) return null;
    const base = navRef.current ?? createMockNavigation(world.submarine.position.x, world.submarine.position.y);
    const incoming = (world as NavWorld).navigation;
    const allWaypoints = [...(incoming?.waypoints ?? base.waypoints), ...localWaypoints];
    return {
      waypoints: allWaypoints,
      currentCourse: courseIds.length ? courseIds : incoming?.currentCourse ?? base.currentCourse,
      terrain: incoming?.terrain ?? base.terrain,
      currents: incoming?.currents ?? base.currents,
      fogOfWar: incoming?.fogOfWar ?? base.fogOfWar,
      beacons: [...(incoming?.beacons ?? base.beacons), ...localBeacons],
    } satisfies NavigationData;
  }, [world, courseIds, localWaypoints, localBeacons]);

  const selectedWaypoint = useMemo(
    () => navigation?.waypoints.find((waypoint) => waypoint.id === selectedWaypointId) ?? null,
    [navigation, selectedWaypointId]
  );

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

  useEffect(() => {
    if (!IS_WEB_RUNTIME) return;

    let raf = 0;
    const frame = (time: number) => {
      frameRef.current = time;
      const canvas = canvasRef.current;
      const liveWorld = worldRef.current;
      const liveNav = navRef.current;
      if (canvas && liveWorld && liveNav) {
        fitCanvasToParent(canvas);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          drawChart(ctx, canvas.width, canvas.height, {
            world: liveWorld,
            navigation: mergeNavigationForDraw(liveWorld, liveNav, courseIds, localWaypoints, localBeacons),
            selectedWaypointId,
            visitedCells,
            time,
          });
        }
      }
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [courseIds, localWaypoints, localBeacons, selectedWaypointId, visitedCells]);

  const handleMapPress = useCallback(
    (event: any) => {
      if (!world || !navigation || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const px = (event.clientX - rect.left) * (canvasRef.current.width / rect.width);
      const py = (event.clientY - rect.top) * (canvasRef.current.height / rect.height);
      const worldPoint = screenToWorld(px, py, canvasRef.current.width, canvasRef.current.height, world);
      const hit = findNearestWaypoint(navigation.waypoints, worldPoint.x, worldPoint.y, 4.8);

      if (toolMode === 'beacon') {
        dropBeacon(worldPoint.x, worldPoint.y);
        return;
      }

      if (toolMode === 'discover') {
        revealAround(worldPoint.x, worldPoint.y, 2);
        return;
      }

      if (hit) {
        plotWaypoint(hit);
        return;
      }

      const waypoint: NavWaypoint = {
        id: `plot-${Date.now()}`,
        x: worldPoint.x,
        y: worldPoint.y,
        type: 'poi',
        label: 'PLOT',
        reached: false,
      };
      setLocalWaypoints((prev) => [...prev, waypoint]);
      plotWaypoint(waypoint);
    },
    [world, navigation, toolMode]
  );

  const plotWaypoint = useCallback(
    (waypoint: NavWaypoint) => {
      setSelectedWaypointId(waypoint.id);
      setCourseIds((prev) => (prev.includes(waypoint.id) ? prev : [...prev, waypoint.id]));
      if (world) {
        setHeading(bearingBetween(world.submarine.position.x, world.submarine.position.y, waypoint.x, waypoint.y));
      }
      void Haptics.selectionAsync().catch(() => undefined);
    },
    [setHeading, world]
  );

  const dropBeacon = useCallback(
    (x?: number, y?: number) => {
      if (!world) return;
      const ahead = projectPoint(
        world.submarine.position.x,
        world.submarine.position.y,
        world.submarine.heading,
        12
      );
      const beacon: ProbeBeacon = {
        id: `beacon-${Date.now()}`,
        x: x ?? ahead.x,
        y: y ?? ahead.y,
        deployedAt: Date.now(),
      };
      setLocalBeacons((prev) => [...prev, beacon]);
      revealAround(beacon.x, beacon.y, 2);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    },
    [world]
  );

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

  const commitDepth = useCallback(
    (depth: number) => {
      const next = Math.round(clamp(depth, DEPTH_MIN, DEPTH_MAX));
      setTargetDepth(next);
      setDepth(next);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    },
    [setDepth]
  );

  const handleDepthTouch = useCallback(
    (event: GestureResponderEvent) => {
      const y = clamp(event.nativeEvent.locationY, 0, depthTrackHeightRef.current);
      const ratio = 1 - y / depthTrackHeightRef.current;
      commitDepth(DEPTH_MIN + ratio * (DEPTH_MAX - DEPTH_MIN));
    },
    [commitDepth]
  );

  if (!world || !navigation) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Awaiting navigation feed</Text>
      </View>
    );
  }

  const sub = world.submarine;
  const depthPct = clamp((targetDepth - DEPTH_MIN) / (DEPTH_MAX - DEPTH_MIN), 0, 1);
  const courseDistance = nextWaypoint
    ? distanceKm(sub.position.x, sub.position.y, nextWaypoint.x, nextWaypoint.y)
    : 0;
  const localTerrain = navigation.terrain
    .slice()
    .sort((a, b) => distanceKm(sub.position.x, sub.position.y, a.x, a.y) - distanceKm(sub.position.x, sub.position.y, b.x, b.y))[0];

  return (
    <View style={styles.root}>
      <View style={styles.leftRail}>
        <MiniSubPanel heading={sub.heading} speed={sub.speed} />

        <InstrumentPanel title="DEPTH CONTROL">
          <View style={styles.depthPanelBody}>
            <View
              style={styles.depthSlider}
              onLayout={(event: LayoutChangeEvent) => {
                depthTrackHeightRef.current = Math.max(1, event.nativeEvent.layout.height);
              }}
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
              onResponderGrant={handleDepthTouch}
              onResponderMove={handleDepthTouch}
            >
              <View style={styles.depthScaleLine} />
              <View style={[styles.depthTarget, { bottom: `${depthPct * 100}%` as any }]} />
              <View
                style={[
                  styles.depthCurrent,
                  {
                    bottom: `${clamp((sub.depth - DEPTH_MIN) / (DEPTH_MAX - DEPTH_MIN), 0, 1) * 100}%` as any,
                  },
                ]}
              />
              {[25, 100, 200, 300].map((depth) => (
                <View
                  key={depth}
                  style={[
                    styles.depthTick,
                    { bottom: `${clamp((depth - DEPTH_MIN) / (DEPTH_MAX - DEPTH_MIN), 0, 1) * 100}%` as any },
                  ]}
                />
              ))}
            </View>
            <View style={styles.depthReadouts}>
              <CompactMetric label="NOW" value={`${Math.round(sub.depth)}m`} color={UI.blue} />
              <CompactMetric label="TARGET" value={`${Math.round(targetDepth)}m`} color={UI.teal} />
              <CompactMetric label="ZONE" value={world.environment.depthZone} color={UI.green} />
            </View>
          </View>
        </InstrumentPanel>

        <InstrumentPanel title="SPEED">
          <View style={styles.speedButtons}>
            {SPEEDS.map((speed) => {
              const active = sub.speed === speed;
              const color = SPEED_COLORS[speed];
              return (
                <TouchableOpacity
                  key={speed}
                  style={[
                    styles.speedButton,
                    { borderColor: active ? color : hexToRgba(color, 0.2) },
                    active && { backgroundColor: hexToRgba(color, 0.12) },
                  ]}
                  activeOpacity={0.82}
                  onPress={() => {
                    setSpeed(speed);
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
                  }}
                >
                  <Text style={[styles.speedText, { color: active ? color : UI.muted }]}>{speed}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={styles.speedReadout}>
            <Text style={styles.largeMetric}>{speedLabel(sub.speed)}</Text>
            <Text style={styles.smallMetric}>ETA {eta}</Text>
          </View>
        </InstrumentPanel>
      </View>

      <View style={styles.centerDeck}>
        <View style={styles.headingRail}>
          <View style={styles.headingTick} />
          <Text style={styles.headingText}>{formatBearing(sub.heading)}</Text>
          <Text style={styles.headingSub}>{bearingLabel(sub.heading)}</Text>
        </View>

        <View style={styles.chartShell}>
          <View style={styles.chartGlow} />
          <View style={styles.chartFrame}>
            {IS_WEB_RUNTIME ? (
              <canvas
                ref={(node) => {
                  canvasRef.current = node as HTMLCanvasElement | null;
                }}
                onClick={handleMapPress}
                style={{ display: 'block', width: '100%', height: '100%', cursor: 'crosshair' } as any}
              />
            ) : (
              <NativeChart world={world} navigation={navigation} selectedWaypointId={selectedWaypointId} />
            )}
            <View style={styles.depthOverlayRail} pointerEvents="box-none">
              <View style={styles.depthOverlayTrack}>
                <View style={[styles.depthOverlayTarget, { bottom: `${depthPct * 100}%` as any }]} />
              </View>
            </View>
          </View>
        </View>

        <View style={styles.controlDock}>
          <ToolButton label="PLOT" color={UI.teal} active={toolMode === 'plot'} onPress={() => setToolMode('plot')} />
          <ToolButton label="DEPTH" color={UI.blue} active={toolMode === 'depth'} onPress={() => setToolMode('depth')} />
          <ToolButton label="BEACON" color={UI.amber} active={toolMode === 'beacon'} onPress={() => setToolMode('beacon')} />
          <ToolButton label="DISCOVER" color={UI.green} active={toolMode === 'discover'} onPress={() => setToolMode('discover')} />
          <TouchableOpacity
            style={styles.primaryDockButton}
            activeOpacity={0.84}
            onPress={() => {
              if (toolMode === 'beacon') dropBeacon();
              else if (nextWaypoint) plotWaypoint(nextWaypoint);
              else revealAround(sub.position.x, sub.position.y, 3);
            }}
          >
            <View style={styles.primaryDockGlyph} />
            <Text style={styles.primaryDockText}>EXECUTE</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.rightRail}>
        <InstrumentPanel title="COURSE" style={styles.coursePanel}>
          <CompactMetric label="NEXT" value={nextWaypoint?.label ?? 'NONE'} color={UI.teal} />
          <CompactMetric label="RANGE" value={`${courseDistance.toFixed(1)}km`} color={UI.green} />
          <CompactMetric label="BEARING" value={nextWaypoint ? formatBearing(bearingBetween(sub.position.x, sub.position.y, nextWaypoint.x, nextWaypoint.y)) : '---'} color={UI.amber} />
          <View style={styles.coursePathMini}>
            {navigation.currentCourse.slice(0, 5).map((id, index) => {
              const waypoint = navigation.waypoints.find((item) => item.id === id);
              return (
                <View key={`${id}-${index}`} style={styles.courseStep}>
                  <View style={[styles.courseStepDot, { backgroundColor: waypointColor(waypoint?.type ?? 'poi') }]} />
                  <View style={styles.courseStepLine} />
                </View>
              );
            })}
          </View>
        </InstrumentPanel>

        <InstrumentPanel title="WAYPOINTS" style={styles.waypointsPanel}>
          {navigation.waypoints.slice(0, 6).map((waypoint) => (
            <TouchableOpacity
              key={waypoint.id}
              style={[
                styles.waypointRow,
                selectedWaypointId === waypoint.id && styles.waypointRowActive,
              ]}
              activeOpacity={0.8}
              onPress={() => plotWaypoint(waypoint)}
            >
              <View style={[styles.waypointIcon, { borderColor: waypointColor(waypoint.type) }]}>
                <View style={[styles.waypointIconCore, { backgroundColor: waypointColor(waypoint.type) }]} />
              </View>
              <View style={styles.waypointCopy}>
                <Text numberOfLines={1} style={styles.waypointName}>{waypoint.label}</Text>
                <Text style={styles.waypointMeta}>
                  {distanceKm(sub.position.x, sub.position.y, waypoint.x, waypoint.y).toFixed(1)}km / {waypoint.type.toUpperCase()}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </InstrumentPanel>

        <InstrumentPanel title="TERRAIN">
          <CompactMetric label="REGION" value={localTerrain?.type.toUpperCase() ?? 'OPEN'} color={UI.blue} />
          <CompactMetric label="FLOOR" value={`${localTerrain?.depth ?? 210}m`} color={UI.teal} />
          <CompactMetric label="CURRENT" value={`${world.environment.currentSpeed.toFixed(1)}kt`} color={UI.green} />
          {selectedWaypoint && (
            <View style={styles.selectedCard}>
              <Text style={styles.selectedName}>{selectedWaypoint.label}</Text>
              <Text style={styles.selectedMeta}>{selectedWaypoint.x.toFixed(1)} E / {selectedWaypoint.y.toFixed(1)} N</Text>
            </View>
          )}
        </InstrumentPanel>
      </View>
    </View>
  );
}

function fitCanvasToParent(canvas: HTMLCanvasElement) {
  const parent = canvas.parentElement;
  if (!parent) return;

  const rect = parent.getBoundingClientRect();
  const width = Math.max(160, Math.floor(rect.width));
  const height = Math.max(120, Math.floor(rect.height));
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
    time: number;
  }
) {
  const { world, navigation, selectedWaypointId, visitedCells, time } = args;
  const sub = world.submarine;
  const scale = Math.min(width, height) / (MAP_KM_RADIUS * 2);

  ctx.clearRect(0, 0, width, height);
  drawOcean(ctx, width, height, time);
  drawMapGrid(ctx, width, height, sub.position.x, sub.position.y, scale);
  drawTerrain(ctx, width, height, sub, scale, navigation.terrain, time);
  drawContours(ctx, width, height, sub, scale, time);
  drawCurrents(ctx, width, height, sub, scale, navigation.currents, time);
  drawCourse(ctx, width, height, sub, scale, navigation);
  drawWaypoints(ctx, width, height, sub, scale, navigation, selectedWaypointId, time);
  drawFog(ctx, width, height, sub, scale, visitedCells, navigation.fogOfWar, time);
  drawCompassRose(ctx, width, height, sub.heading);
  drawSubmarine(ctx, width / 2, height / 2, sub.heading, time);
  drawMapRim(ctx, width, height);
}

function drawOcean(ctx: CanvasRenderingContext2D, width: number, height: number, time: number) {
  const bg = ctx.createRadialGradient(width * 0.5, height * 0.48, 0, width * 0.5, height * 0.5, Math.max(width, height));
  bg.addColorStop(0, '#062a2d');
  bg.addColorStop(0.5, '#031419');
  bg.addColorStop(1, '#02080b');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = 'rgba(77,255,174,0.035)';
  for (let i = 0; i < 160; i += 1) {
    const x = (i * 97 + time * 0.012) % width;
    const y = (i * 53 + Math.sin(time * 0.0007 + i) * 18) % height;
    ctx.fillRect(x, y, 1.2, 1.2);
  }
}

function drawMapGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  subX: number,
  subY: number,
  scale: number
) {
  const cell = 6 * scale;
  const xOffset = width / 2 - positiveModulo(subX * scale, cell);
  const yOffset = height / 2 - positiveModulo(subY * scale, cell);

  ctx.strokeStyle = 'rgba(77,255,174,0.07)';
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

function drawTerrain(
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
    const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, Math.max(rx, ry));
    gradient.addColorStop(0, hexToRgba(color, region.type === 'trench' ? 0.18 : 0.22));
    gradient.addColorStop(1, hexToRgba(color, 0));

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate((region.angle ?? 0) * (Math.PI / 180));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = hexToRgba(color, 0.22 + Math.sin(time * 0.001 + region.x) * 0.04);
    ctx.lineWidth = 1.2;
    for (let i = 0.35; i <= 1; i += 0.22) {
      ctx.beginPath();
      ctx.ellipse(0, 0, rx * i, ry * i, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  });
}

function drawContours(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  sub: World['submarine'],
  scale: number,
  time: number
) {
  ctx.strokeStyle = 'rgba(67,183,255,0.12)';
  ctx.lineWidth = 1;

  for (let i = -4; i <= 5; i += 1) {
    const yWorld = sub.position.y + i * 7;
    ctx.beginPath();
    for (let step = -4; step <= 64; step += 1) {
      const xWorld = sub.position.x - 34 + step;
      const wave = Math.sin((xWorld + time * 0.00008) * 0.33 + i) * 1.7;
      const p = worldToScreen(xWorld, yWorld + wave, width, height, sub, scale);
      if (step === -4) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }
}

function drawCurrents(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  sub: World['submarine'],
  scale: number,
  currents: CurrentRegion[],
  time: number
) {
  currents.forEach((current) => {
    const center = worldToScreen(current.x, current.y, width, height, sub, scale);
    const radius = current.radius * scale;
    const dir = (current.direction - 90) * (Math.PI / 180);
    const dx = Math.cos(dir);
    const dy = Math.sin(dir);
    const phase = (time * 0.0003 * current.strength) % 1;

    ctx.strokeStyle = hexToRgba(UI.teal, 0.18 + current.strength * 0.04);
    ctx.lineWidth = 1.4;
    for (let lane = -2; lane <= 2; lane += 1) {
      const offset = lane * radius * 0.2;
      const px = center.x - dy * offset;
      const py = center.y + dx * offset;
      ctx.beginPath();
      for (let step = -8; step <= 8; step += 1) {
        const t = step / 8;
        const drift = (phase - 0.5) * 22;
        const x = px + dx * radius * t + drift * dx;
        const y = py + dy * radius * t + Math.sin(t * Math.PI * 2 + time * 0.002) * 6;
        if (step === -8) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  });
}

function drawCourse(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  sub: World['submarine'],
  scale: number,
  navigation: NavigationData
) {
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
    ctx.arc(p.x, p.y, (selected ? 12 : 9) * pulse, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = color;
    if (waypoint.type === 'objective') {
      drawDiamond(ctx, p.x, p.y, 5.8);
    } else if (waypoint.type === 'harbor') {
      ctx.fillRect(p.x - 4, p.y - 4, 8, 8);
    } else {
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
      const size = FOG_CELL_KM * scale + 2;
      const alpha = 0.45 + Math.sin(time * 0.0008 + gx * 2.1 + gy) * 0.04;
      ctx.fillStyle = `rgba(0,4,7,${alpha})`;
      ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
      ctx.fillStyle = 'rgba(21,42,44,0.18)';
      ctx.beginPath();
      ctx.arc(p.x + Math.sin(time * 0.0006 + gx) * 8, p.y, size * 0.42, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawCompassRose(ctx: CanvasRenderingContext2D, width: number, height: number, heading: number) {
  const x = width - 52;
  const y = 52;
  const r = 28;

  ctx.strokeStyle = hexToRgba(UI.green, 0.34);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();

  for (let deg = 0; deg < 360; deg += 45) {
    const rad = (deg - heading - 90) * (Math.PI / 180);
    const inner = deg % 90 === 0 ? r * 0.35 : r * 0.55;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(rad) * inner, y + Math.sin(rad) * inner);
    ctx.lineTo(x + Math.cos(rad) * r, y + Math.sin(rad) * r);
    ctx.stroke();
  }

  ctx.fillStyle = UI.teal;
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('N', x, y - r - 6);
}

function drawSubmarine(ctx: CanvasRenderingContext2D, x: number, y: number, heading: number, time: number) {
  const rad = (heading - 90) * (Math.PI / 180);
  const pulse = 0.55 + Math.sin(time * 0.004) * 0.15;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rad);
  ctx.shadowColor = UI.teal;
  ctx.shadowBlur = 16;
  ctx.fillStyle = UI.teal;
  ctx.beginPath();
  ctx.moveTo(16, 0);
  ctx.lineTo(-11, -8);
  ctx.lineTo(-7, 0);
  ctx.lineTo(-11, 8);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = hexToRgba(UI.green, pulse);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(0, 0, 22, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawMapRim(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.strokeStyle = 'rgba(77,255,174,0.26)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, width - 2, height - 2);

  ctx.strokeStyle = 'rgba(0,229,204,0.14)';
  ctx.lineWidth = 1;
  ctx.strokeRect(12, 12, width - 24, height - 24);
}

function NativeChart({
  world,
  navigation,
  selectedWaypointId,
}: {
  world: World;
  navigation: NavigationData;
  selectedWaypointId: string | null;
}) {
  const sub = world.submarine;
  return (
    <View style={styles.nativeChart}>
      <View style={styles.nativeGridVertical} />
      <View style={styles.nativeGridHorizontal} />
      {navigation.terrain.map((region) => {
        const p = nativePercent(region.x, region.y, sub.position.x, sub.position.y);
        return (
          <View
            key={region.id}
            style={[
              styles.nativeTerrain,
              {
                left: `${p.x}%` as any,
                top: `${p.y}%` as any,
                backgroundColor: hexToRgba(terrainColor(region.type), 0.18),
                borderColor: hexToRgba(terrainColor(region.type), 0.25),
              },
            ]}
          />
        );
      })}
      {navigation.waypoints.map((waypoint) => {
        const p = nativePercent(waypoint.x, waypoint.y, sub.position.x, sub.position.y);
        return (
          <View
            key={waypoint.id}
            style={[
              styles.nativeWaypoint,
              waypoint.id === selectedWaypointId && styles.nativeWaypointSelected,
              {
                left: `${p.x}%` as any,
                top: `${p.y}%` as any,
                borderColor: waypointColor(waypoint.type),
                backgroundColor: waypointColor(waypoint.type),
              },
            ]}
          />
        );
      })}
      <View style={[styles.nativeSub, { transform: [{ rotate: `${sub.heading}deg` }] }]} />
    </View>
  );
}

function MiniSubPanel({ heading, speed }: { heading: number; speed: Speed }) {
  return (
    <View style={styles.subPanel}>
      <View style={styles.subBeam} />
      <View style={styles.subBody}>
        <View style={styles.subSail} />
        <View style={styles.subTail} />
      </View>
      <View style={styles.subDots}>
        {[UI.teal, UI.green, UI.amber, UI.dim].map((color, index) => (
          <View key={`${color}-${index}`} style={[styles.subDot, { backgroundColor: color }]} />
        ))}
      </View>
      <View style={styles.subStats}>
        <Text style={styles.microText}>{formatBearing(heading)}</Text>
        <Text style={styles.microText}>{speed}</Text>
      </View>
    </View>
  );
}

function InstrumentPanel({
  title,
  children,
  style,
}: {
  title: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.panel, style]}>
      <Text style={styles.panelTitle}>{title}</Text>
      {children}
    </View>
  );
}

function CompactMetric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text numberOfLines={1} style={[styles.metricValue, { color }]}>{value}</Text>
    </View>
  );
}

function ToolButton({
  label,
  color,
  active,
  onPress,
}: {
  label: string;
  color: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.toolButton,
        active && { borderColor: color, backgroundColor: hexToRgba(color, 0.12) },
      ]}
      activeOpacity={0.82}
      onPress={onPress}
    >
      <View style={[styles.toolGlyph, { borderColor: color }]}>
        <View style={[styles.toolGlyphCore, { backgroundColor: color }]} />
      </View>
      <Text style={[styles.toolText, { color: active ? color : UI.muted }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function mergeNavigationForDraw(
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
      { id: 'obj-01', x: x + 22, y: y - 14, type: 'objective', label: 'SIGNAL', reached: false },
      { id: 'safe-01', x: x - 18, y: y + 16, type: 'harbor', label: 'HARBOR', reached: false },
      { id: 'poi-01', x: x + 8, y: y + 23, type: 'poi', label: 'RIDGE', reached: false },
      { id: 'poi-02', x: x - 25, y: y - 8, type: 'poi', label: 'KELP', reached: false },
    ],
    currentCourse: ['obj-01'],
    terrain: [
      { id: 'ridge-a', x: x + 10, y: y + 8, radiusX: 18, radiusY: 5, type: 'ridge', depth: 160, angle: -18 },
      { id: 'trench-a', x: x - 18, y: y - 16, radiusX: 10, radiusY: 22, type: 'trench', depth: 420, angle: 24 },
      { id: 'kelp-a', x: x - 24, y: y + 9, radiusX: 12, radiusY: 9, type: 'kelp', depth: 45, angle: 6 },
      { id: 'shelf-a', x: x + 26, y: y - 21, radiusX: 16, radiusY: 12, type: 'shelf', depth: 90, angle: -8 },
      { id: 'abyss-a', x: x + 2, y: y - 30, radiusX: 13, radiusY: 13, type: 'abyss', depth: 700 },
    ],
    currents: [
      { id: 'current-a', x: x + 12, y: y - 11, radius: 17, direction: 72, strength: 0.7 },
      { id: 'current-b', x: x - 21, y: y + 18, radius: 13, direction: 138, strength: 0.45 },
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

function worldToScreen(
  x: number,
  y: number,
  width: number,
  height: number,
  sub: World['submarine'],
  scale: number
) {
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
    case 'ridge':
      return UI.blue;
    case 'trench':
      return UI.red;
    case 'kelp':
      return UI.green;
    case 'shelf':
      return UI.amber;
    case 'abyss':
    default:
      return UI.teal;
  }
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

function cellKey(x: number, y: number) {
  return `${x}:${y}`;
}

function positiveModulo(value: number, mod: number) {
  return ((value % mod) + mod) % mod;
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
    flexDirection: 'row',
    gap: 10,
    padding: 10,
    backgroundColor: UI.bg,
  },
  leftRail: {
    width: '23%' as any,
    gap: 10,
  },
  centerDeck: {
    flex: 1,
    gap: 8,
    minWidth: 0,
  },
  rightRail: {
    width: '23%' as any,
    gap: 10,
  },
  panel: {
    flex: 1,
    minHeight: 0,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: UI.border,
    backgroundColor: UI.panel,
    padding: 10,
    overflow: 'hidden',
  },
  panelTitle: {
    fontFamily: 'Orbitron_400Regular',
    fontSize: 9,
    lineHeight: 11,
    color: UI.muted,
    letterSpacing: 0,
    marginBottom: 8,
  },
  subPanel: {
    height: 92,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: UI.border,
    backgroundColor: UI.panel,
    padding: 10,
    overflow: 'hidden',
  },
  subBeam: {
    position: 'absolute',
    left: 10,
    top: 33,
    width: '42%' as any,
    height: 26,
    backgroundColor: 'rgba(0,229,204,0.16)',
    borderTopRightRadius: 40,
    borderBottomRightRadius: 40,
  },
  subBody: {
    position: 'absolute',
    left: '28%' as any,
    top: 34,
    width: '48%' as any,
    height: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,229,204,0.5)',
    backgroundColor: 'rgba(0,229,204,0.18)',
  },
  subSail: {
    position: 'absolute',
    left: '43%' as any,
    top: -12,
    width: 10,
    height: 12,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    backgroundColor: 'rgba(0,229,204,0.42)',
  },
  subTail: {
    position: 'absolute',
    right: -12,
    top: 2,
    width: 16,
    height: 10,
    borderTopWidth: 5,
    borderBottomWidth: 5,
    borderLeftWidth: 12,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: 'rgba(0,229,204,0.45)',
  },
  subDots: {
    position: 'absolute',
    left: 14,
    bottom: 14,
    flexDirection: 'row',
    gap: 10,
  },
  subDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  subStats: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    alignItems: 'flex-end',
  },
  microText: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 10,
    lineHeight: 12,
    color: UI.muted,
    letterSpacing: 0,
  },
  headingRail: {
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: UI.border,
    backgroundColor: 'rgba(3,18,23,0.74)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  headingTick: {
    position: 'absolute',
    top: 0,
    width: 2,
    height: 12,
    backgroundColor: UI.teal,
  },
  headingText: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 14,
    lineHeight: 16,
    color: UI.teal,
    letterSpacing: 0,
  },
  headingSub: {
    position: 'absolute',
    right: 12,
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 10,
    color: UI.muted,
    letterSpacing: 0,
  },
  chartShell: {
    flex: 1,
    minHeight: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartGlow: {
    position: 'absolute',
    width: '82%' as any,
    height: '82%' as any,
    borderRadius: 18,
    backgroundColor: 'rgba(0,229,204,0.035)',
  },
  chartFrame: {
    width: '100%' as any,
    height: '100%' as any,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(77,255,174,0.22)',
    backgroundColor: '#02080b',
  },
  depthOverlayRail: {
    position: 'absolute',
    right: 12,
    top: 18,
    bottom: 18,
    width: 18,
    alignItems: 'center',
  },
  depthOverlayTrack: {
    flex: 1,
    width: 4,
    borderRadius: 3,
    backgroundColor: 'rgba(67,183,255,0.16)',
  },
  depthOverlayTarget: {
    position: 'absolute',
    left: -5,
    width: 14,
    height: 2,
    borderRadius: 2,
    backgroundColor: UI.teal,
  },
  controlDock: {
    height: 62,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  toolButton: {
    width: 58,
    height: 52,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(77,255,174,0.16)',
    backgroundColor: 'rgba(3,18,23,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolGlyph: {
    width: 19,
    height: 19,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 3,
  },
  toolGlyphCore: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  toolText: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 7,
    lineHeight: 8,
    letterSpacing: 0,
  },
  primaryDockButton: {
    width: 82,
    height: 58,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: UI.teal,
    backgroundColor: 'rgba(0,229,204,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryDockGlyph: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: UI.teal,
    marginBottom: 3,
  },
  primaryDockText: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 8,
    lineHeight: 9,
    color: UI.teal,
    letterSpacing: 0,
  },
  depthPanelBody: {
    flex: 1,
    minHeight: 0,
    flexDirection: 'row',
    gap: 12,
  },
  depthSlider: {
    width: 42,
    flex: 1,
    minHeight: 130,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(67,183,255,0.18)',
    backgroundColor: 'rgba(2,8,11,0.72)',
    alignItems: 'center',
  },
  depthScaleLine: {
    position: 'absolute',
    top: 10,
    bottom: 10,
    width: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(67,183,255,0.16)',
  },
  depthTarget: {
    position: 'absolute',
    width: 28,
    height: 3,
    marginBottom: -1,
    borderRadius: 3,
    backgroundColor: UI.teal,
  },
  depthCurrent: {
    position: 'absolute',
    width: 14,
    height: 14,
    marginBottom: -7,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: UI.blue,
    backgroundColor: 'rgba(67,183,255,0.22)',
  },
  depthTick: {
    position: 'absolute',
    width: 18,
    height: 1,
    backgroundColor: 'rgba(67,183,255,0.22)',
  },
  depthReadouts: {
    flex: 1,
    justifyContent: 'space-around',
  },
  speedButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  speedButton: {
    flexGrow: 1,
    minWidth: '43%' as any,
    borderWidth: 1,
    borderRadius: 7,
    paddingVertical: 9,
    alignItems: 'center',
    backgroundColor: 'rgba(2,8,11,0.52)',
  },
  speedText: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 10,
    lineHeight: 11,
    letterSpacing: 0,
  },
  speedReadout: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(77,255,174,0.08)',
  },
  largeMetric: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 13,
    lineHeight: 15,
    color: UI.teal,
    letterSpacing: 0,
  },
  smallMetric: {
    marginTop: 4,
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 10,
    lineHeight: 12,
    color: UI.muted,
    letterSpacing: 0,
  },
  coursePanel: {
    flex: 0.86,
  },
  waypointsPanel: {
    flex: 1.36,
  },
  coursePathMini: {
    height: 28,
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  courseStep: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  courseStepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  courseStepLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(0,229,204,0.22)',
  },
  waypointRow: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(77,255,174,0.07)',
  },
  waypointRowActive: {
    backgroundColor: 'rgba(0,229,204,0.07)',
    borderRadius: 7,
    paddingHorizontal: 6,
  },
  waypointIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waypointIconCore: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  waypointCopy: {
    flex: 1,
    minWidth: 0,
  },
  waypointName: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 10,
    lineHeight: 12,
    color: UI.teal,
    letterSpacing: 0,
  },
  waypointMeta: {
    marginTop: 2,
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 9,
    lineHeight: 10,
    color: UI.muted,
    letterSpacing: 0,
  },
  selectedCard: {
    marginTop: 10,
    padding: 8,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(0,229,204,0.16)',
    backgroundColor: 'rgba(0,229,204,0.06)',
  },
  selectedName: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 10,
    lineHeight: 12,
    color: UI.teal,
    letterSpacing: 0,
  },
  selectedMeta: {
    marginTop: 2,
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 9,
    lineHeight: 10,
    color: UI.muted,
    letterSpacing: 0,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(77,255,174,0.07)',
  },
  metricLabel: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 9,
    color: UI.muted,
    letterSpacing: 0,
  },
  metricValue: {
    flex: 1,
    textAlign: 'right',
    fontFamily: 'Orbitron_700Bold',
    fontSize: 10,
    letterSpacing: 0,
  },
  nativeChart: {
    flex: 1,
    backgroundColor: '#031419',
    overflow: 'hidden',
  },
  nativeGridVertical: {
    position: 'absolute',
    left: '50%' as any,
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(77,255,174,0.15)',
  },
  nativeGridHorizontal: {
    position: 'absolute',
    top: '50%' as any,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(77,255,174,0.15)',
  },
  nativeTerrain: {
    position: 'absolute',
    width: 88,
    height: 52,
    marginLeft: -44,
    marginTop: -26,
    borderRadius: 40,
    borderWidth: 1,
  },
  nativeWaypoint: {
    position: 'absolute',
    width: 12,
    height: 12,
    marginLeft: -6,
    marginTop: -6,
    borderRadius: 6,
    borderWidth: 1,
  },
  nativeWaypointSelected: {
    width: 18,
    height: 18,
    marginLeft: -9,
    marginTop: -9,
    borderRadius: 9,
    backgroundColor: 'transparent',
  },
  nativeSub: {
    position: 'absolute',
    left: '50%' as any,
    top: '50%' as any,
    width: 0,
    height: 0,
    marginLeft: -8,
    marginTop: -8,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 20,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: UI.teal,
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
