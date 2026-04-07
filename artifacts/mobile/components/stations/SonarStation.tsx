import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useGame, Enemy } from '@/contexts/GameContext';
import { Colors } from '@/constants/Colors';
import { bearingRangeToOffset, bearingLabel, rangeKm } from '@/utils/bearingMath';
import { playSound } from '@/utils/sounds';
import * as Haptics from 'expo-haptics';
import { MissionTaskCard } from '@/components/game/MissionTaskCard';

type PingMode = 'active' | 'passive';

export function SonarStation() {
  const { gameState, sonarPing } = useGame();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const waterfallRef = useRef<HTMLCanvasElement | null>(null);
  const sweepRef = useRef(0);
  const pingRadiusRef = useRef(0);
  const pingActiveRef = useRef(false);
  const frameRef = useRef(0);
  const waterfallDataRef = useRef<{ freq: number; strength: number }[][]>([]);
  const [pingMode, setPingMode] = useState<PingMode>('active');
  const [pinging, setPinging] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const [cooldownPct, setCooldownPct] = useState(100);
  const [acoustics, setAcoustics] = useState<{ low: number; mid: number; high: number } | null>(null);
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const gs = gameState;

  const contacts = gs?.enemies.filter((e) => e.detected && !e.destroyed) ?? [];

  // Sonar canvas draw loop (web only)
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let raf = 0;
    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) { raf = requestAnimationFrame(draw); return; }
      const container = canvas.parentElement;
      if (container) {
        const size = Math.min(container.clientWidth, container.clientHeight) - 16;
        if (size > 80 && Math.abs(canvas.width - size) > 4) {
          canvas.width = size;
          canvas.height = size;
        }
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) { raf = requestAnimationFrame(draw); return; }
      const W = canvas.width || 280;
      const H = canvas.height || 280;
      const cx = W / 2, cy = H / 2, r = W / 2 - 20;
      ctx.clearRect(0, 0, W, H);

      // Background
      ctx.fillStyle = '#000a08';
      ctx.fillRect(0, 0, W, H);
      const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      bg.addColorStop(0, '#001510');
      bg.addColorStop(1, '#000805');
      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();

      // Rings with km labels
      const RING_KM = [15, 30, 45, 60];
      [0.25, 0.5, 0.75, 1].forEach((f, i) => {
        ctx.beginPath(); ctx.arc(cx, cy, r * f, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0,229,204,${f === 1 ? 0.4 : 0.12})`;
        ctx.lineWidth = f === 1 ? 1.5 : 0.8;
        ctx.setLineDash(f < 1 ? [3, 6] : []);
        ctx.stroke();
        ctx.setLineDash([]);
        if (f < 1) {
          ctx.fillStyle = 'rgba(0,229,204,0.4)';
          ctx.font = `${Math.max(7, r * 0.055)}px monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(RING_KM[i] + 'km', cx, cy - r * f - 3);
          ctx.textBaseline = 'alphabetic';
        }
      });

      // Crosshair
      ctx.strokeStyle = 'rgba(0,229,204,0.15)'; ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.stroke();

      // Tick marks
      for (let i = 0; i < 36; i++) {
        const ang = (i * 10 - 90) * Math.PI / 180;
        const maj = i % 3 === 0;
        ctx.strokeStyle = `rgba(0,229,204,${maj ? 0.7 : 0.25})`;
        ctx.lineWidth = maj ? 1.2 : 0.6;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * (r - (maj ? 10 : 5)), cy + Math.sin(ang) * (r - (maj ? 10 : 5)));
        ctx.lineTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
        ctx.stroke();
      }

      // Degree labels
      const lFont = Math.max(7, r * 0.06);
      ctx.fillStyle = 'rgba(0,229,204,0.55)';
      ctx.font = `${lFont}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].forEach((deg) => {
        const rad = (deg - 90) * Math.PI / 180;
        ctx.fillText(String(deg).padStart(3, '0'), cx + Math.cos(rad) * (r + 14), cy + Math.sin(rad) * (r + 14));
      });
      ctx.textBaseline = 'alphabetic';

      // Sweep trail
      const sweepRad = (sweepRef.current - 90) * Math.PI / 180;
      const trail = 70 * Math.PI / 180;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, 'rgba(0,229,204,0.2)');
      g.addColorStop(1, 'rgba(0,229,204,0.02)');
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, sweepRad - trail, sweepRad);
      ctx.closePath(); ctx.fillStyle = g; ctx.fill();

      // Sweep arm
      ctx.strokeStyle = 'rgba(0,229,204,0.85)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(sweepRad) * r, cy + Math.sin(sweepRad) * r);
      ctx.stroke();

      // Ping ring
      if (pingActiveRef.current) {
        pingRadiusRef.current = Math.min(pingRadiusRef.current + 5, r);
        ctx.beginPath(); ctx.arc(cx, cy, pingRadiusRef.current, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0,229,204,${0.8 * (1 - pingRadiusRef.current / r)})`;
        ctx.lineWidth = 2; ctx.stroke();
        if (pingRadiusRef.current >= r) pingActiveRef.current = false;
      }

      // Contacts
      const heading = gs?.heading ?? 0;
      const liveDetected = gs?.enemies.filter((e) => e.detected && !e.destroyed) ?? [];
      liveDetected.forEach((c) => {
        const off = bearingRangeToOffset(c.bearing - heading, Math.min(c.range, 0.92));
        const ex = cx + off.x * r;
        const ey = cy + off.y * r;

        // Deep signal contact — slow, diffuse, mysterious. Distinct from
        // tactical contacts. Slower pulse, softer edges, "???" label.
        if (c.style === 'pulse-slow') {
          const t = Date.now() * 0.0008;
          const teal = c.col || '#00e5cc';

          // Outer halo — large radial gradient, very faint
          const haloR = 22 + Math.sin(t) * 4;
          const halo = ctx.createRadialGradient(ex, ey, 0, ex, ey, haloR);
          halo.addColorStop(0, teal + '40');
          halo.addColorStop(0.4, teal + '18');
          halo.addColorStop(1, teal + '00');
          ctx.fillStyle = halo;
          ctx.beginPath();
          ctx.arc(ex, ey, haloR, 0, Math.PI * 2);
          ctx.fill();

          // Three concentric expanding rings — staggered phases create
          // a continuous slow ripple, much slower than tactical pulse
          for (let ring = 0; ring < 3; ring++) {
            const phase = ((t * 0.6 + ring * 0.33) % 1);
            const ringR = 4 + phase * 20;
            const alpha = (1 - phase) * 0.4;
            if (alpha <= 0) continue;
            ctx.beginPath();
            ctx.arc(ex, ey, ringR, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(0,229,204,${alpha.toFixed(3)})`;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }

          // Broken distortion crosshair — signal interference, suggests
          // the system can't quite resolve what it's seeing
          const distAlpha = 0.12 + Math.sin(t * 1.5) * 0.06;
          ctx.strokeStyle = `rgba(0,229,204,${distAlpha.toFixed(3)})`;
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(ex - 14, ey); ctx.lineTo(ex - 6, ey);
          ctx.moveTo(ex + 6, ey); ctx.lineTo(ex + 14, ey);
          ctx.moveTo(ex, ey - 14); ctx.lineTo(ex, ey - 6);
          ctx.moveTo(ex, ey + 6); ctx.lineTo(ex, ey + 14);
          ctx.stroke();

          // Soft center dot — small, doesn't dominate
          ctx.beginPath();
          ctx.arc(ex, ey, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = teal + 'cc';
          ctx.fill();

          // Label — "???" in dim teal, signals unknown classification
          ctx.fillStyle = teal + 'aa';
          ctx.font = 'bold 8px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('???', ex, ey + 22);
          return; // skip the normal contact render below
        }

        // Normal tactical contact rendering
        const col = c.identified ? c.col || Colors.red : '#ffb300';
        ctx.beginPath(); ctx.arc(ex, ey, 5, 0, Math.PI * 2);
        ctx.fillStyle = col + '33'; ctx.fill();
        ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.stroke();
        // Pulsing outer ring
        ctx.beginPath();
        ctx.arc(ex, ey, 8 + Math.sin(Date.now() * 0.004 + c.id) * 2, 0, Math.PI * 2);
        ctx.strokeStyle = col + '44'; ctx.lineWidth = 0.8; ctx.stroke();
        // Label
        ctx.fillStyle = col; ctx.font = '7px monospace'; ctx.textAlign = 'center';
        ctx.fillText(c.identified ? c.type.slice(0, 6) : ('?' + c.id), ex, ey + 14);
      });

      // Sub at center
      ctx.fillStyle = '#00e5cc';
      ctx.beginPath();
      (ctx as any).roundRect(cx - 3, cy - 8, 6, 16, 3);
      ctx.fill();
      ctx.fillRect(cx - 1.5, cy - 13, 3, 6);
      ctx.beginPath(); ctx.arc(cx, cy, 11, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0,229,204,0.25)'; ctx.lineWidth = 0.8; ctx.stroke();

      // Border
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0,229,204,0.4)'; ctx.lineWidth = 2; ctx.stroke();

      sweepRef.current = (sweepRef.current + 0.8) % 360;

      // Waterfall
      drawWaterfall();

      raf = requestAnimationFrame(draw);
    };

    const drawWaterfall = () => {
      const wc = waterfallRef.current;
      if (!wc) return;
      const wCtx = wc.getContext('2d');
      if (!wCtx) return;
      const W = wc.width, H = wc.height;
      wCtx.fillStyle = '#000a08';
      wCtx.fillRect(0, 0, W, H);
      const data = waterfallDataRef.current;
      if (!data.length) {
        wCtx.fillStyle = 'rgba(0,229,204,0.06)';
        for (let x = 0; x < W; x += 4) {
          const h = 2 + Math.random() * 3;
          wCtx.fillRect(x, H / 2 - h / 2, 2, h);
        }
        return;
      }
      data.forEach((row, rowIdx) => {
        const y = Math.floor((rowIdx / 20) * H);
        const rowH = Math.ceil(H / 20) + 1;
        row.forEach((c) => {
          const x = Math.floor((c.freq / 120) * W);
          const w = Math.max(2, c.strength * 12);
          const alpha = (1 - rowIdx / 20) * c.strength * 0.8;
          wCtx.fillStyle = `rgba(0,229,204,${alpha})`;
          wCtx.fillRect(x - w / 2, y, w, rowH);
        });
      });
      wCtx.fillStyle = 'rgba(0,229,204,0.04)';
      for (let x = 0; x < W; x += 3) {
        const h = 1 + Math.random() * 2;
        wCtx.fillRect(x, Math.random() * H, 1, h);
      }
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [gs]);

  const doPing = useCallback(() => {
    if (cooldown || pingMode !== 'active') return;
    setPinging(true);
    setCooldown(true);
    setCooldownPct(100);
    pingActiveRef.current = true;
    pingRadiusRef.current = 0;
    sonarPing();
    playSound('sonarPing');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    // Update acoustics after delay
    setTimeout(() => {
      setPinging(false);
      const det = gs?.enemies.filter((e) => e.detected && !e.destroyed) ?? [];
      if (det.length > 0) {
        const strongest = det.reduce((a, b) => ((a.strength || 0) > (b.strength || 0) ? a : b));
        const s = strongest.strength || 0.5;
        setAcoustics({
          low: Math.round(s * 60 + Math.random() * 20),
          mid: Math.round(s * 45 + Math.random() * 25),
          high: Math.round(s * 30 + Math.random() * 15),
        });
      }
      // Add waterfall data
      waterfallDataRef.current.unshift(
        det.map((c) => ({ freq: 20 + c.bearing / 3, strength: c.strength || 0.5 }))
      );
      if (waterfallDataRef.current.length > 20) waterfallDataRef.current.pop();
    }, 1200);

    // Cooldown (8s)
    let pct = 100;
    if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    cooldownTimerRef.current = setInterval(() => {
      pct -= 100 / (8000 / 100);
      setCooldownPct(Math.max(0, pct));
      if (pct <= 0) {
        clearInterval(cooldownTimerRef.current!);
        cooldownTimerRef.current = null;
        setCooldown(false);
        setCooldownPct(100);
      }
    }, 100);
  }, [cooldown, pingMode, sonarPing, gs]);

  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    };
  }, []);

  if (!gs) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Awaiting game state...</Text>
      </View>
    );
  }

  const undetected = gs.enemies.filter((e) => !e.detected && !e.destroyed);

  return (
    <View style={styles.root}>
      {/* LEFT: Sonar scope — full height */}
      <View style={styles.scopeCol}>
        {/* Header */}
        <View style={styles.scopeHeader}>
          <Text style={styles.scopeTitle}>SONAR</Text>
          <View style={styles.modeRow}>
            <TouchableOpacity
              style={[styles.modeBtn, pingMode === 'active' && styles.modeBtnActive]}
              onPress={() => setPingMode('active')}
            >
              <Text style={[styles.modeBtnText, pingMode === 'active' && styles.modeBtnTextActive]}>
                {'\u25CF'} ACTIVE
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, pingMode === 'passive' && styles.modeBtnActive]}
              onPress={() => setPingMode('passive')}
            >
              <Text style={[styles.modeBtnText, pingMode === 'passive' && styles.modeBtnTextActive]}>
                {'\u25CC'} PASSIVE
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Mode note */}
        <View style={styles.modeNote}>
          <Text style={styles.modeNoteText}>
            {pingMode === 'active'
              ? 'ACTIVE PING \u2014 ENEMIES CAN DETECT YOU'
              : 'PASSIVE LISTENING \u2014 SILENT & SAFE'}
          </Text>
        </View>

        {/* Canvas */}
        <View style={styles.canvasWrap}>
          {Platform.OS === 'web' ? (
            <canvas
              ref={(el) => { canvasRef.current = el as any; }}
              style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: '50%' } as any}
            />
          ) : (
            <View style={styles.fallbackScope}>
              <Text style={styles.fallbackText}>SONAR SCOPE</Text>
              <Text style={styles.fallbackSub}>{contacts.length} contacts detected</Text>
            </View>
          )}
        </View>

        {/* Waterfall */}
        <View style={styles.waterfallWrap}>
          <Text style={styles.waterfallLabel}>WATERFALL \u2014 SOUND SIGNATURE</Text>
          {Platform.OS === 'web' ? (
            <canvas
              ref={(el) => { waterfallRef.current = el as any; }}
              width={240}
              height={36}
              style={{ width: '100%', borderRadius: 3, background: '#000a08', display: 'block' } as any}
            />
          ) : (
            <View style={styles.waterfallFallback} />
          )}
        </View>
      </View>

      {/* RIGHT: Controls */}
      <View style={styles.rightPanel}>
        <MissionTaskCard />

        {/* Ping button */}
        <TouchableOpacity
          style={[
            styles.pingBtn,
            (cooldown || pingMode !== 'active') && styles.pingBtnDisabled,
          ]}
          onPress={doPing}
          disabled={cooldown || pingMode !== 'active'}
          activeOpacity={0.8}
        >
          <Text style={styles.pingBtnText}>
            {pinging ? 'PINGING...' : 'PING'}
          </Text>
        </TouchableOpacity>

        {/* Cooldown bar */}
        <View style={styles.cooldownRow}>
          <View style={styles.cooldownBar}>
            <View style={[styles.cooldownFill, { width: `${cooldownPct}%` as any }]} />
          </View>
          <Text style={styles.cooldownStatus}>
            {cooldown ? 'COOLDOWN' : 'READY'}
          </Text>
        </View>

        {/* Contacts */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>CONTACTS DETECTED</Text>
          {contacts.length === 0 ? (
            <Text style={styles.noContactText}>No contacts \u2014 ping the water</Text>
          ) : (
            contacts.map((enemy) => <ContactRow key={enemy.id} enemy={enemy} />)
          )}
          {undetected.length > 0 && (
            <View style={styles.undetectedNote}>
              <Text style={styles.undetectedText}>
                {undetected.length} undetected \u2014 ping to reveal
              </Text>
            </View>
          )}
        </View>

        {/* Acoustic Signature */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>ACOUSTIC SIGNATURE</Text>
          {(['LOW FREQ', 'MID FREQ', 'HIGH FREQ'] as const).map((label, i) => {
            const val = acoustics ? [acoustics.low, acoustics.mid, acoustics.high][i] : 0;
            return (
              <View key={label} style={styles.freqRow}>
                <Text style={styles.freqLabel}>{label}</Text>
                <View style={styles.freqBar}>
                  <View style={[styles.freqFill, { width: `${val}%` as any }]} />
                </View>
                <Text style={[styles.freqVal, acoustics && { color: Colors.teal }]}>
                  {acoustics ? `${val}Hz` : '---'}
                </Text>
              </View>
            );
          })}
          <Text style={styles.acousticNote}>
            {acoustics
              ? `${contacts.length} acoustic signature${contacts.length !== 1 ? 's' : ''} detected`
              : 'Ping to get acoustic reading'}
          </Text>
        </View>
      </View>
    </View>
  );
}

function ContactRow({ enemy }: { enemy: Enemy }) {
  return (
    <View style={styles.contactRow}>
      <View
        style={[
          styles.contactDot,
          { backgroundColor: enemy.identified ? Colors.red : Colors.amber },
        ]}
      />
      <Text style={[styles.contactType, { color: enemy.identified ? '#ccc' : '#886600' }]}>
        {enemy.identified ? enemy.type : 'UNIDENTIFIED'}
      </Text>
      <View style={styles.contactRight}>
        <Text style={styles.contactBearing}>{bearingLabel(enemy.bearing)}</Text>
        <Text style={styles.contactRange}>{rangeKm(enemy.range)}km</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row' },
  scopeCol: {
    flex: 1,
    backgroundColor: '#000a08',
    borderRightWidth: 1,
    borderRightColor: 'rgba(0,229,204,0.12)',
  },
  scopeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,229,204,0.12)',
  },
  scopeTitle: {
    fontFamily: 'Orbitron_900Black',
    fontSize: 13,
    color: Colors.teal,
    letterSpacing: 3,
    flex: 1,
  },
  modeRow: { flexDirection: 'row', gap: 6 },
  modeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'transparent',
  },
  modeBtnActive: {
    borderColor: Colors.teal,
    backgroundColor: 'rgba(0,229,204,0.1)',
  },
  modeBtnText: {
    fontFamily: 'Orbitron_400Regular',
    fontSize: 7,
    letterSpacing: 1.5,
    color: '#2a4a44',
  },
  modeBtnTextActive: { color: Colors.teal },
  modeNote: {
    paddingVertical: 4,
    backgroundColor: 'rgba(0,229,204,0.03)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,229,204,0.06)',
  },
  modeNoteText: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 8,
    color: '#1a3a30',
    textAlign: 'center',
    letterSpacing: 1,
  },
  canvasWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  fallbackScope: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#001510',
    borderWidth: 2,
    borderColor: 'rgba(0,229,204,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackText: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 10,
    color: Colors.teal,
    letterSpacing: 2,
  },
  fallbackSub: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 9,
    color: '#1a3a30',
    marginTop: 4,
  },
  waterfallWrap: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,229,204,0.08)',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  waterfallLabel: {
    fontFamily: 'Orbitron_400Regular',
    fontSize: 6,
    letterSpacing: 2,
    color: '#0a2a24',
    marginBottom: 4,
  },
  waterfallFallback: {
    height: 36,
    borderRadius: 3,
    backgroundColor: '#000a08',
  },

  // Right panel
  rightPanel: {
    width: '44%' as any,
    minWidth: 270,
    maxWidth: 460,
    padding: 12,
    gap: 10,
  },
  pingBtn: {
    width: '100%',
    paddingVertical: 18,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: Colors.teal,
    backgroundColor: 'rgba(0,229,204,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pingBtnDisabled: { opacity: 0.3 },
  pingBtnText: {
    fontFamily: 'Orbitron_900Black',
    fontSize: 22,
    color: Colors.teal,
    letterSpacing: 4,
  },
  cooldownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: -4,
  },
  cooldownBar: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(0,229,204,0.1)',
    overflow: 'hidden',
  },
  cooldownFill: {
    height: '100%',
    backgroundColor: Colors.teal,
    borderRadius: 2,
  },
  cooldownStatus: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 8,
    color: '#1a3a30',
    letterSpacing: 1,
  },

  // Cards
  card: {
    backgroundColor: Colors.bgCard2,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 12,
  },
  cardLabel: {
    fontFamily: 'Orbitron_400Regular',
    fontSize: 7,
    color: Colors.textDim,
    letterSpacing: 2,
    marginBottom: 8,
  },
  noContactText: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 10,
    color: '#1a3a30',
    paddingVertical: 6,
    letterSpacing: 1,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,229,204,0.06)',
  },
  contactDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  contactType: {
    flex: 1,
    fontFamily: 'Orbitron_400Regular',
    fontSize: 10,
    letterSpacing: 1,
  },
  contactRight: { alignItems: 'flex-end' },
  contactBearing: {
    fontFamily: 'Orbitron_400Regular',
    fontSize: 10,
    color: Colors.teal,
    letterSpacing: 1,
  },
  contactRange: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 8,
    color: '#1a3a30',
  },
  undetectedNote: {
    marginTop: 8,
    padding: 8,
    backgroundColor: 'rgba(255,179,0,0.05)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,179,0,0.1)',
  },
  undetectedText: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 9,
    color: Colors.textDim,
    letterSpacing: 0.5,
    textAlign: 'center',
  },

  // Acoustic
  freqRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  freqLabel: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 10,
    color: '#2a4a44',
    width: 66,
  },
  freqBar: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(0,229,204,0.08)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  freqFill: {
    height: '100%',
    backgroundColor: Colors.teal,
    borderRadius: 2,
  },
  freqVal: {
    fontFamily: 'Orbitron_400Regular',
    fontSize: 9,
    color: '#1a3a30',
    minWidth: 34,
    textAlign: 'right',
  },
  acousticNote: {
    marginTop: 8,
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 9,
    color: '#1a3a30',
    letterSpacing: 1,
  },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 12,
    color: Colors.textDim,
  },
});
