import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';

import { useGame } from '@/contexts/GameContext';
import { Colors } from '@/constants/Colors';
import {
  type Contact,
  type World,
  bearingLabel,
  bearingRangeToOffset,
  rangeFracToKm,
} from '@workspace/world';

const IS_WEB_RUNTIME =
  typeof window !== 'undefined' &&
  typeof document !== 'undefined' &&
  typeof requestAnimationFrame !== 'undefined';

type PingMode = 'ACTIVE' | 'PASSIVE';

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

export function SonarStation() {
  const { world, sonarPing } = useGame();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const waveformRef = useRef<HTMLCanvasElement | null>(null);
  const worldRef = useRef<World | null>(world);
  const sweepRef = useRef(0);
  const lastFrameRef = useRef(0);
  const pingStartedAtRef = useRef<number | null>(null);
  const [pingMode, setPingMode] = useState<PingMode>('ACTIVE');
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    worldRef.current = world;
  }, [world]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 150);
    return () => clearInterval(timer);
  }, []);

  const contacts = useMemo(
    () => world?.contacts.filter((contact) => contact.detected && !contact.destroyed) ?? [],
    [world]
  );

  const hiddenContacts = useMemo(
    () => world?.contacts.filter((contact) => !contact.detected && !contact.destroyed).length ?? 0,
    [world]
  );

  const cooldownActive = cooldownUntil > now;
  const cooldownPct = cooldownActive
    ? clamp((cooldownUntil - now) / 5200, 0, 1)
    : 0;

  useEffect(() => {
    if (!IS_WEB_RUNTIME) return;

    let raf = 0;

    const frame = (time: number) => {
      const dt = lastFrameRef.current ? time - lastFrameRef.current : 16;
      lastFrameRef.current = time;
      sweepRef.current = (sweepRef.current + dt * 0.026) % 360;

      const scope = canvasRef.current;
      if (scope) {
        fitCanvasToParent(scope);
        const ctx = scope.getContext('2d');
        if (ctx) {
          drawSonarScope(ctx, scope.width, scope.height, {
            world: worldRef.current,
            sweepDeg: sweepRef.current,
            pingStartedAt: pingStartedAtRef.current,
            time,
          });
        }
      }

      const waveform = waveformRef.current;
      if (waveform) {
        fitCanvasToParent(waveform);
        const ctx = waveform.getContext('2d');
        if (ctx) {
          drawWaveform(ctx, waveform.width, waveform.height, worldRef.current, time);
        }
      }

      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const handlePing = useCallback(() => {
    if (cooldownActive || pingMode !== 'ACTIVE') return;

    pingStartedAtRef.current = Date.now();
    setCooldownUntil(Date.now() + 5200);
    sonarPing();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined);
  }, [cooldownActive, pingMode, sonarPing]);

  if (!world) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Awaiting sonar feed</Text>
      </View>
    );
  }

  const sonarPower = world.systems.sonar.powerLevel;
  const propulsionNoise = world.systems.propulsion.noise;
  const ambientNoise = world.environment.ambientNoise;
  const heading = world.submarine.heading;
  const depth = world.submarine.depth;
  const strongest = contacts.reduce<Contact | null>((best, contact) => {
    if (!best) return contact;
    return contact.strength > best.strength ? contact : best;
  }, null);

  return (
    <View style={styles.root}>
      <View style={styles.leftRail}>
        <MiniSubPanel heading={heading} speed={world.submarine.speed} />

        <InstrumentPanel title="ACOUSTICS">
          <NoiseGauge value={propulsionNoise} />
          <SignalBar label="SHIP" value={propulsionNoise} color={UI.green} />
          <SignalBar label="SEA" value={ambientNoise} color={UI.blue} />
          <SignalBar label="ARRAY" value={sonarPower} color={UI.amber} />
        </InstrumentPanel>

        <InstrumentPanel title="SIGNAL">
          <View style={styles.waveformStage}>
            {IS_WEB_RUNTIME ? (
              <canvas
                ref={(node) => {
                  waveformRef.current = node as HTMLCanvasElement | null;
                }}
                style={{ display: 'block', width: '100%', height: '100%' } as any}
              />
            ) : (
              <NativeWaveform strength={strongest?.strength ?? 0.25} />
            )}
          </View>
        </InstrumentPanel>
      </View>

      <View style={styles.centerDeck}>
        <View style={styles.headingRail}>
          <View style={styles.headingTick} />
          <Text style={styles.headingText}>{formatBearing(heading)}</Text>
          <Text style={styles.headingSub}>{bearingLabel(heading)}</Text>
        </View>

        <View style={styles.scopeShell}>
          <View style={styles.scopeGlow} />
          <View style={styles.scopeFrame}>
            {IS_WEB_RUNTIME ? (
              <canvas
                ref={(node) => {
                  canvasRef.current = node as HTMLCanvasElement | null;
                }}
                style={{ display: 'block', width: '100%', height: '100%' } as any}
              />
            ) : (
              <NativeScope contacts={contacts} heading={heading} />
            )}
          </View>
        </View>

        <View style={styles.controlDock}>
          <ModeButton
            label="PASSIVE"
            color={UI.blue}
            active={pingMode === 'PASSIVE'}
            onPress={() => setPingMode('PASSIVE')}
          />
          <ModeButton
            label="ACTIVE"
            color={UI.green}
            active={pingMode === 'ACTIVE'}
            onPress={() => setPingMode('ACTIVE')}
          />
          <TouchableOpacity
            style={[
              styles.pingButton,
              cooldownActive && styles.pingButtonDisabled,
              pingMode === 'PASSIVE' && styles.pingButtonPassive,
            ]}
            activeOpacity={0.82}
            disabled={cooldownActive || pingMode === 'PASSIVE'}
            onPress={handlePing}
          >
            <View style={styles.pingIconOuter}>
              <View style={styles.pingIconInner} />
            </View>
            <Text style={styles.pingButtonText}>
              {pingMode === 'PASSIVE' ? 'SILENT' : cooldownActive ? 'SYNC' : 'PING'}
            </Text>
          </TouchableOpacity>
          <ModeButton label="RANGE" color={UI.amber} active={false} />
          <ModeButton label="TRACK" color={UI.red} active={contacts.length > 0} />
        </View>

        <View style={styles.cooldownTrack}>
          <View
            style={[
              styles.cooldownFill,
              { width: `${cooldownActive ? cooldownPct * 100 : 100}%` as any },
            ]}
          />
        </View>
      </View>

      <View style={styles.rightRail}>
        <InstrumentPanel title="CONTACTS" style={styles.contactsPanel}>
          <ContactMatrix contacts={contacts} hiddenContacts={hiddenContacts} />
        </InstrumentPanel>

        <InstrumentPanel title="STRONGEST">
          {strongest ? (
            <ContactReadout contact={strongest} />
          ) : (
            <View style={styles.quietPanel}>
              <View style={styles.quietPulse} />
              <Text style={styles.quietText}>QUIET WATER</Text>
            </View>
          )}
        </InstrumentPanel>

        <InstrumentPanel title="BOAT">
          <CompactMetric label="DEPTH" value={`${Math.round(depth)} m`} color={UI.blue} />
          <CompactMetric label="NOISE" value={`${Math.round(propulsionNoise)}%`} color={UI.green} />
          <CompactMetric label="SEA" value={`${Math.round(ambientNoise)}%`} color={UI.amber} />
        </InstrumentPanel>
      </View>
    </View>
  );
}

function fitCanvasToParent(canvas: HTMLCanvasElement) {
  const parent = canvas.parentElement;
  if (!parent) return;

  const rect = parent.getBoundingClientRect();
  const width = Math.max(80, Math.floor(rect.width));
  const height = Math.max(80, Math.floor(rect.height));
  const ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const nextWidth = Math.floor(width * ratio);
  const nextHeight = Math.floor(height * ratio);

  if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
    canvas.width = nextWidth;
    canvas.height = nextHeight;
  }
}

function drawSonarScope(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  args: {
    world: World | null;
    sweepDeg: number;
    pingStartedAt: number | null;
    time: number;
  }
) {
  const { world, sweepDeg, pingStartedAt, time } = args;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.45;
  const heading = world?.submarine.heading ?? 0;
  const contacts = world?.contacts.filter((contact) => contact.detected && !contact.destroyed) ?? [];

  ctx.clearRect(0, 0, width, height);

  const bg = ctx.createRadialGradient(cx, cy, radius * 0.08, cx, cy, radius * 1.15);
  bg.addColorStop(0, '#073326');
  bg.addColorStop(0.52, '#031815');
  bg.addColorStop(1, '#020609');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();

  drawScopeTexture(ctx, cx, cy, radius, time);
  drawGrid(ctx, cx, cy, radius);
  drawSweep(ctx, cx, cy, radius, sweepDeg);
  drawPing(ctx, cx, cy, radius, pingStartedAt, time);

  contacts.forEach((contact) => {
    drawContact(ctx, cx, cy, radius, contact, heading, time);
  });

  ctx.restore();

  drawBearingTicks(ctx, cx, cy, radius, heading);
  drawCenterSub(ctx, cx, cy, time);
  drawScopeRim(ctx, cx, cy, radius);
}

function drawScopeTexture(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  time: number
) {
  ctx.fillStyle = 'rgba(77,255,174,0.055)';
  for (let i = 0; i < 180; i += 1) {
    const a = ((i * 137.5 + time * 0.01) % 360) * (Math.PI / 180);
    const d = radius * (((i * 41) % 100) / 100);
    const x = cx + Math.cos(a) * d;
    const y = cy + Math.sin(a) * d;
    ctx.fillRect(x, y, 1.2, 1.2);
  }
}

function drawGrid(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number) {
  ctx.strokeStyle = 'rgba(77,255,174,0.13)';
  ctx.lineWidth = Math.max(1, radius * 0.002);

  [0.2, 0.4, 0.6, 0.8, 1].forEach((scale) => {
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

  ctx.strokeStyle = 'rgba(77,255,174,0.32)';
  ctx.beginPath();
  ctx.moveTo(cx, cy - radius);
  ctx.lineTo(cx, cy + radius);
  ctx.moveTo(cx - radius, cy);
  ctx.lineTo(cx + radius, cy);
  ctx.stroke();
}

function drawSweep(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  sweepDeg: number
) {
  const sweep = (sweepDeg - 90) * (Math.PI / 180);
  const trail = 52 * (Math.PI / 180);
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  gradient.addColorStop(0, 'rgba(77,255,174,0.46)');
  gradient.addColorStop(0.65, 'rgba(77,255,174,0.16)');
  gradient.addColorStop(1, 'rgba(77,255,174,0.02)');

  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, radius, sweep - trail, sweep);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.shadowColor = UI.green;
  ctx.shadowBlur = 14;
  ctx.strokeStyle = 'rgba(136,255,188,0.92)';
  ctx.lineWidth = Math.max(1.5, radius * 0.006);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(sweep) * radius, cy + Math.sin(sweep) * radius);
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function drawPing(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  pingStartedAt: number | null,
  time: number
) {
  if (!pingStartedAt) return;

  const age = Date.now() - pingStartedAt;
  if (age > 1550) return;

  const phase = age / 1550;
  ctx.strokeStyle = `rgba(77,255,174,${0.7 * (1 - phase)})`;
  ctx.lineWidth = Math.max(2, radius * 0.012);
  ctx.beginPath();
  ctx.arc(cx, cy, radius * phase, 0, Math.PI * 2);
  ctx.stroke();

  const secondPhase = clamp((age - 220) / 1550, 0, 1);
  if (secondPhase > 0) {
    ctx.strokeStyle = `rgba(0,229,204,${0.38 * (1 - secondPhase)})`;
    ctx.lineWidth = Math.max(1, radius * 0.006);
    ctx.beginPath();
    ctx.arc(cx, cy, radius * secondPhase, 0, Math.PI * 2);
    ctx.stroke();
  }

  const pulse = 5 + Math.sin(time * 0.022) * 1.5;
  ctx.fillStyle = 'rgba(77,255,174,0.92)';
  ctx.beginPath();
  ctx.arc(cx, cy, pulse, 0, Math.PI * 2);
  ctx.fill();
}

function drawContact(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  contact: Contact,
  heading: number,
  time: number
) {
  const offset = bearingRangeToOffset(
    normalizeBearing(contact.bearing - heading),
    clamp(contact.range, 0.025, 0.96)
  );
  const x = cx + offset.x * radius;
  const y = cy + offset.y * radius;
  const color = contact.color || (contact.identified ? UI.red : UI.amber);
  const strength = clamp(contact.strength || 0.45, 0.25, 1);

  if (contact.style === 'pulse-slow') {
    const t = time * 0.00022;
    const haloRadius = radius * (0.055 + Math.sin(t * Math.PI * 2) * 0.012);
    const halo = ctx.createRadialGradient(x, y, 0, x, y, haloRadius * 3.4);
    halo.addColorStop(0, 'rgba(0,229,204,0.44)');
    halo.addColorStop(0.45, 'rgba(0,229,204,0.12)');
    halo.addColorStop(1, 'rgba(0,229,204,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(x, y, haloRadius * 3.4, 0, Math.PI * 2);
    ctx.fill();

    for (let i = 0; i < 3; i += 1) {
      const phase = (t + i * 0.33) % 1;
      const ringRadius = radius * (0.018 + phase * 0.12);
      const alpha = (1 - phase) * 0.42;
      ctx.strokeStyle = `rgba(0,229,204,${alpha})`;
      ctx.lineWidth = Math.max(1, radius * 0.003);
      ctx.beginPath();
      ctx.arc(x, y, ringRadius, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(0,229,204,0.34)';
    ctx.lineWidth = Math.max(1, radius * 0.003);
    ctx.beginPath();
    ctx.moveTo(x - radius * 0.04, y);
    ctx.lineTo(x - radius * 0.015, y);
    ctx.moveTo(x + radius * 0.015, y);
    ctx.lineTo(x + radius * 0.04, y);
    ctx.moveTo(x, y - radius * 0.04);
    ctx.lineTo(x, y - radius * 0.015);
    ctx.moveTo(x, y + radius * 0.015);
    ctx.lineTo(x, y + radius * 0.04);
    ctx.stroke();

    ctx.shadowColor = UI.teal;
    ctx.shadowBlur = 18;
    ctx.fillStyle = UI.teal;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(3, radius * 0.01), 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    return;
  }

  const pulse = 0.5 + Math.sin(time * 0.006 + contact.id) * 0.5;
  const coreRadius = Math.max(3, radius * (0.008 + strength * 0.008));
  const ringRadius = coreRadius + 4 + pulse * 5;

  ctx.shadowColor = color;
  ctx.shadowBlur = 16;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, coreRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = hexToRgba(color, contact.identified ? 0.52 : 0.38);
  ctx.lineWidth = Math.max(1, radius * 0.004);
  ctx.beginPath();
  ctx.arc(x, y, ringRadius, 0, Math.PI * 2);
  ctx.stroke();

  if (contact.identified) {
    ctx.strokeStyle = hexToRgba(color, 0.42);
    ctx.beginPath();
    ctx.moveTo(x - coreRadius * 2.2, y);
    ctx.lineTo(x + coreRadius * 2.2, y);
    ctx.moveTo(x, y - coreRadius * 2.2);
    ctx.lineTo(x, y + coreRadius * 2.2);
    ctx.stroke();
  }
}

function drawBearingTicks(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  heading: number
) {
  for (let deg = 0; deg < 360; deg += 10) {
    const relative = normalizeBearing(deg - heading);
    const rad = (relative - 90) * (Math.PI / 180);
    const major = deg % 30 === 0;
    const outer = radius * 1.025;
    const inner = radius * (major ? 0.965 : 0.99);

    ctx.strokeStyle = major ? 'rgba(77,255,174,0.62)' : 'rgba(77,255,174,0.24)';
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(rad) * inner, cy + Math.sin(rad) * inner);
    ctx.lineTo(cx + Math.cos(rad) * outer, cy + Math.sin(rad) * outer);
    ctx.stroke();
  }

  ctx.fillStyle = UI.green;
  ctx.beginPath();
  ctx.moveTo(cx, cy - radius * 1.065);
  ctx.lineTo(cx - radius * 0.018, cy - radius * 1.025);
  ctx.lineTo(cx + radius * 0.018, cy - radius * 1.025);
  ctx.closePath();
  ctx.fill();
}

function drawCenterSub(ctx: CanvasRenderingContext2D, cx: number, cy: number, time: number) {
  const pulse = 0.18 + Math.sin(time * 0.004) * 0.08;

  ctx.strokeStyle = `rgba(77,255,174,${pulse})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, 20, 0, Math.PI * 2);
  ctx.stroke();

  ctx.shadowColor = UI.green;
  ctx.shadowBlur = 12;
  ctx.fillStyle = UI.green;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 8, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(cx - 2, cy - 21, 4, 8);
  ctx.shadowBlur = 0;
}

function drawScopeRim(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number) {
  ctx.strokeStyle = 'rgba(77,255,174,0.38)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(0,229,204,0.16)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 1.055, 0, Math.PI * 2);
  ctx.stroke();
}

function drawWaveform(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  world: World | null,
  time: number
) {
  const contacts = world?.contacts.filter((contact) => contact.detected && !contact.destroyed) ?? [];
  const noise = world?.environment.ambientNoise ?? 18;
  const signal = contacts.reduce((sum, contact) => sum + contact.strength, 0);
  const baseAmp = height * (0.08 + noise / 700);
  const signalAmp = height * Math.min(0.28, signal * 0.065);

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#02080b';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = 'rgba(77,255,174,0.08)';
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += width / 10) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  drawSignalLine(ctx, width, height, baseAmp, time * 0.001, 'rgba(67,183,255,0.34)', 1.1);
  drawSignalLine(ctx, width, height, baseAmp + signalAmp, time * 0.0015, 'rgba(77,255,174,0.78)', 1.8);

  contacts.slice(0, 4).forEach((contact, index) => {
    const x = width * (0.18 + index * 0.18 + (contact.bearing % 20) / 140);
    const h = height * (0.16 + contact.strength * 0.5);
    const color = contact.color || UI.amber;
    ctx.fillStyle = hexToRgba(color, 0.18);
    ctx.fillRect(x - 2, height / 2 - h / 2, 4, h);
  });
}

function drawSignalLine(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  amplitude: number,
  phase: number,
  color: string,
  lineWidth: number
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();

  for (let x = 0; x <= width; x += 3) {
    const n = x / width;
    const y =
      height / 2 +
      Math.sin(n * Math.PI * 8 + phase * 3.2) * amplitude +
      Math.sin(n * Math.PI * 17 + phase * 2.1) * amplitude * 0.42;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }

  ctx.stroke();
}

function NativeScope({ contacts, heading }: { contacts: Contact[]; heading: number }) {
  return (
    <View style={styles.nativeScope}>
      <View style={styles.nativeScopeRing} />
      <View style={[styles.nativeScopeRing, styles.nativeScopeRingTwo]} />
      <View style={[styles.nativeScopeRing, styles.nativeScopeRingThree]} />
      <View style={styles.nativeCrossVertical} />
      <View style={styles.nativeCrossHorizontal} />
      <View style={styles.nativeSweep} />
      {contacts.map((contact) => {
        const offset = bearingRangeToOffset(
          normalizeBearing(contact.bearing - heading),
          clamp(contact.range, 0.025, 0.92)
        );
        const color = contact.color || (contact.identified ? UI.red : UI.amber);
        return (
          <View
            key={contact.id}
            style={[
              styles.nativeBlip,
              contact.style === 'pulse-slow' && styles.nativeBlipSlow,
              {
                backgroundColor: color,
                borderColor: color,
                left: `${50 + offset.x * 44}%` as any,
                top: `${50 + offset.y * 44}%` as any,
              },
            ]}
          />
        );
      })}
      <View style={styles.nativeCenterSub} />
    </View>
  );
}

function NativeWaveform({ strength }: { strength: number }) {
  return (
    <View style={styles.nativeWaveform}>
      {Array.from({ length: 18 }).map((_, index) => {
        const height = 8 + Math.abs(Math.sin(index * 0.8)) * 18 + strength * 18;
        return <View key={index} style={[styles.nativeWaveBar, { height }]} />;
      })}
    </View>
  );
}

function MiniSubPanel({ heading, speed }: { heading: number; speed: string }) {
  return (
    <View style={styles.subPanel}>
      <View style={styles.subBeam} />
      <View style={styles.subBody}>
        <View style={styles.subSail} />
        <View style={styles.subTail} />
      </View>
      <View style={styles.subDots}>
        {[UI.green, UI.green, UI.amber, UI.dim].map((color, index) => (
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

function NoiseGauge({ value }: { value: number }) {
  const normalized = clamp(value / 100, 0, 1);
  return (
    <View style={styles.noiseGauge}>
      {Array.from({ length: 15 }).map((_, index) => {
        const active = index / 14 <= normalized;
        return (
          <View
            key={index}
            style={[
              styles.noiseTick,
              {
                height: 8 + index * 1.4,
                opacity: active ? 1 : 0.15,
                backgroundColor: active ? UI.green : UI.dim,
              },
            ]}
          />
        );
      })}
      <View style={styles.gaugeCore}>
        <View style={styles.gaugeFanBlade} />
        <View style={[styles.gaugeFanBlade, { transform: [{ rotate: '120deg' }] }]} />
        <View style={[styles.gaugeFanBlade, { transform: [{ rotate: '240deg' }] }]} />
      </View>
    </View>
  );
}

function SignalBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.signalRow}>
      <Text style={styles.signalLabel}>{label}</Text>
      <View style={styles.signalTrack}>
        <View style={[styles.signalFill, { width: `${clamp(value, 0, 100)}%` as any, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function ContactMatrix({
  contacts,
  hiddenContacts,
}: {
  contacts: Contact[];
  hiddenContacts: number;
}) {
  const cells = Array.from({ length: 28 });

  return (
    <View style={styles.matrix}>
      {cells.map((_, index) => {
        const contact = contacts[index];
        const color = contact?.color || (contact ? UI.amber : UI.dim);
        return (
          <View
            key={index}
            style={[
              styles.matrixDot,
              contact && styles.matrixDotActive,
              contact?.style === 'pulse-slow' && styles.matrixDotDeep,
              {
                backgroundColor: contact?.style === 'pulse-slow' ? 'transparent' : color,
                borderColor: contact?.style === 'pulse-slow' ? color : 'transparent',
              },
            ]}
          />
        );
      })}
      <View style={styles.matrixFooter}>
        <Text style={styles.matrixText}>{contacts.length} LIVE</Text>
        <Text style={styles.matrixText}>{hiddenContacts} QUIET</Text>
      </View>
    </View>
  );
}

function ContactReadout({ contact }: { contact: Contact }) {
  const color = contact.color || (contact.identified ? UI.red : UI.amber);
  return (
    <View style={styles.contactReadout}>
      <View style={[styles.contactBeacon, { backgroundColor: color, borderColor: color }]} />
      <View style={styles.contactCopy}>
        <Text numberOfLines={1} style={[styles.contactName, { color }]}>
          {contact.identified ? contact.type : 'UNIDENTIFIED'}
        </Text>
        <Text style={styles.contactMeta}>
          {bearingLabel(contact.bearing)} / {rangeFracToKm(contact.range).toFixed(1)} km
        </Text>
      </View>
    </View>
  );
}

function CompactMetric({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
    </View>
  );
}

function ModeButton({
  label,
  color,
  active,
  onPress,
}: {
  label: string;
  color: string;
  active: boolean;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.modeCircle,
        active && { borderColor: color, backgroundColor: hexToRgba(color, 0.12) },
      ]}
      disabled={!onPress}
      activeOpacity={0.8}
      onPress={onPress}
    >
      <View style={[styles.modeGlyph, { borderColor: color }]}>
        <View style={[styles.modeGlyphDot, { backgroundColor: color }]} />
      </View>
      <Text style={[styles.modeLabel, { color: active ? color : UI.muted }]}>{label}</Text>
    </TouchableOpacity>
  );
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
    backgroundColor: 'rgba(77,255,174,0.16)',
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
    borderColor: 'rgba(77,255,174,0.5)',
    backgroundColor: 'rgba(77,255,174,0.18)',
  },
  subSail: {
    position: 'absolute',
    left: '43%' as any,
    top: -12,
    width: 10,
    height: 12,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    backgroundColor: 'rgba(77,255,174,0.42)',
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
    borderLeftColor: 'rgba(77,255,174,0.45)',
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
    backgroundColor: UI.green,
  },
  headingText: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 14,
    lineHeight: 16,
    color: UI.green,
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
  scopeShell: {
    flex: 1,
    minHeight: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scopeGlow: {
    position: 'absolute',
    width: '78%' as any,
    aspectRatio: 1,
    borderRadius: 999,
    backgroundColor: 'rgba(77,255,174,0.035)',
  },
  scopeFrame: {
    width: '100%' as any,
    height: '100%' as any,
    maxWidth: 560,
    maxHeight: 560,
    aspectRatio: 1,
    borderRadius: 999,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(77,255,174,0.22)',
    backgroundColor: '#02080b',
  },
  controlDock: {
    height: 62,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  modeCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(77,255,174,0.16)',
    backgroundColor: 'rgba(3,18,23,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeGlyph: {
    width: 19,
    height: 19,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 3,
  },
  modeGlyphDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  modeLabel: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 7,
    lineHeight: 8,
    letterSpacing: 0,
  },
  pingButton: {
    width: 72,
    height: 58,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: UI.green,
    backgroundColor: 'rgba(77,255,174,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pingButtonDisabled: {
    opacity: 0.55,
  },
  pingButtonPassive: {
    borderColor: UI.blue,
    backgroundColor: 'rgba(67,183,255,0.1)',
  },
  pingIconOuter: {
    width: 25,
    height: 25,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: UI.green,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 3,
  },
  pingIconInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: UI.green,
  },
  pingButtonText: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 9,
    lineHeight: 10,
    color: UI.green,
    letterSpacing: 0,
  },
  cooldownTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(77,255,174,0.08)',
    overflow: 'hidden',
  },
  cooldownFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: UI.green,
  },
  noiseGauge: {
    height: 68,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 4,
    marginBottom: 8,
  },
  noiseTick: {
    width: 4,
    borderRadius: 3,
  },
  gaugeCore: {
    position: 'absolute',
    left: '50%' as any,
    top: 20,
    width: 26,
    height: 26,
    marginLeft: -13,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(77,255,174,0.26)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gaugeFanBlade: {
    position: 'absolute',
    width: 5,
    height: 16,
    borderRadius: 4,
    backgroundColor: 'rgba(77,255,174,0.58)',
    top: 2,
  },
  signalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 7,
  },
  signalLabel: {
    width: 40,
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 9,
    color: UI.muted,
    letterSpacing: 0,
  },
  signalTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(77,255,174,0.08)',
    overflow: 'hidden',
  },
  signalFill: {
    height: '100%',
    borderRadius: 2,
  },
  waveformStage: {
    flex: 1,
    minHeight: 52,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(77,255,174,0.11)',
    backgroundColor: '#02080b',
    overflow: 'hidden',
  },
  contactsPanel: {
    flex: 1.28,
  },
  matrix: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignContent: 'flex-start',
    gap: 8,
  },
  matrixDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    opacity: 0.28,
  },
  matrixDotActive: {
    opacity: 1,
  },
  matrixDotDeep: {
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: UI.teal,
    backgroundColor: 'transparent',
  },
  matrixFooter: {
    width: '100%' as any,
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  matrixText: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 9,
    color: UI.muted,
    letterSpacing: 0,
  },
  contactReadout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
  },
  contactBeacon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
  },
  contactCopy: {
    flex: 1,
    minWidth: 0,
  },
  contactName: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 10,
    lineHeight: 12,
    letterSpacing: 0,
  },
  contactMeta: {
    marginTop: 3,
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 10,
    color: UI.muted,
    letterSpacing: 0,
  },
  quietPanel: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quietPulse: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(77,255,174,0.24)',
    marginBottom: 6,
  },
  quietText: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 9,
    color: UI.muted,
    letterSpacing: 0,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    fontFamily: 'Orbitron_700Bold',
    fontSize: 11,
    letterSpacing: 0,
  },
  nativeScope: {
    flex: 1,
    backgroundColor: '#031915',
    borderRadius: 999,
    overflow: 'hidden',
  },
  nativeScopeRing: {
    position: 'absolute',
    left: '10%' as any,
    right: '10%' as any,
    top: '10%' as any,
    bottom: '10%' as any,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(77,255,174,0.22)',
  },
  nativeScopeRingTwo: {
    left: '25%' as any,
    right: '25%' as any,
    top: '25%' as any,
    bottom: '25%' as any,
  },
  nativeScopeRingThree: {
    left: '39%' as any,
    right: '39%' as any,
    top: '39%' as any,
    bottom: '39%' as any,
  },
  nativeCrossVertical: {
    position: 'absolute',
    left: '50%' as any,
    top: '8%' as any,
    bottom: '8%' as any,
    width: 1,
    backgroundColor: 'rgba(77,255,174,0.18)',
  },
  nativeCrossHorizontal: {
    position: 'absolute',
    top: '50%' as any,
    left: '8%' as any,
    right: '8%' as any,
    height: 1,
    backgroundColor: 'rgba(77,255,174,0.18)',
  },
  nativeSweep: {
    position: 'absolute',
    left: '50%' as any,
    top: '50%' as any,
    width: '42%' as any,
    height: 2,
    backgroundColor: 'rgba(77,255,174,0.75)',
    transform: [{ rotate: '-24deg' }],
  },
  nativeBlip: {
    position: 'absolute',
    width: 10,
    height: 10,
    marginLeft: -5,
    marginTop: -5,
    borderRadius: 5,
    borderWidth: 1,
  },
  nativeBlipSlow: {
    width: 18,
    height: 18,
    marginLeft: -9,
    marginTop: -9,
    backgroundColor: 'transparent',
  },
  nativeCenterSub: {
    position: 'absolute',
    left: '50%' as any,
    top: '50%' as any,
    width: 12,
    height: 18,
    marginLeft: -6,
    marginTop: -9,
    borderRadius: 8,
    backgroundColor: UI.green,
  },
  nativeWaveform: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
  },
  nativeWaveBar: {
    flex: 1,
    borderRadius: 2,
    backgroundColor: 'rgba(77,255,174,0.55)',
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
