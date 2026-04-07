import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import { useGame, Enemy, TorpedoEvent } from '@/contexts/GameContext';
import { Colors } from '@/constants/Colors';
import { bearingLabel, rangeKm, hitProbability } from '@/utils/bearingMath';
import { playSound } from '@/utils/sounds';
import * as Haptics from 'expo-haptics';
import { MissionTaskCard } from '@/components/game/MissionTaskCard';

type VisionMode = 'standard' | 'thermal' | 'nightops';

// ─── Thermal creature types ───
const CREATURE_TYPES = [
  { name: 'GIANT SQUID', width: 40, height: 25, color: '#ff4400', kind: 'squid' as const },
  { name: 'ANGLERFISH', width: 20, height: 14, color: '#ffaa00', kind: 'angler' as const },
  { name: 'LEVIATHAN', width: 80, height: 30, color: '#ff2200', kind: 'leviathan' as const },
];
interface ThermalCreature {
  type: typeof CREATURE_TYPES[number];
  x: number; y: number; vx: number; alpha: number; spawnTime: number;
}
const _creatures: ThermalCreature[] = [];

// ─── Torpedo / explosion state (module-level for canvas access) ───
interface TorpedoAnim {
  x: number; y: number; targetX: number; targetY: number;
  progress: number; // 0→1
  hit: boolean; // determined once it arrives
  targetId: number;
}
interface Explosion {
  x: number; y: number; frame: number; maxFrames: number;
}
let _torpedo: TorpedoAnim | null = null;
let _explosions: Explosion[] = [];

// ─── Periscope view bearing (module-level for drag handler + draw) ───
let _viewBearing = 0;
let _dragStartX = 0;
let _dragStartBearing = 0;

export function WeaponsStation() {
  const { gameState, fireTorpedo, lockTarget, lastTorpedoEvent } = useGame();
  const [selectedTarget, setSelectedTarget] = useState<number | null>(null);
  const [firing, setFiring] = useState(false);
  const [visionMode, setVisionMode] = useState<VisionMode>('standard');
  const [viewBearing, setViewBearing] = useState(0);
  const lastEventRef = useRef<number>(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef(0);
  const lockProgressRef = useRef(0);
  const isLockedRef = useRef(false);

  const gs = gameState;

  // React to torpedo events from server (triggers explosions for ALL players)
  useEffect(() => {
    if (!lastTorpedoEvent || lastTorpedoEvent.timestamp === lastEventRef.current) return;
    lastEventRef.current = lastTorpedoEvent.timestamp;
    if (lastTorpedoEvent.targetBearing != null) {
      const canvas = canvasRef.current;
      const W = canvas?.width || 400;
      const H = canvas?.height || 280;
      const fov = 90;
      const degPerPx = fov / W;
      const diff = ((lastTorpedoEvent.targetBearing - _viewBearing + 540) % 360) - 180;
      const ex = W / 2 + diff / degPerPx;
      const ey = H * 0.48 - ((1 - (lastTorpedoEvent.targetRange || 0.5)) * 15);
      _explosions.push({ x: ex, y: ey, frame: 0, maxFrames: lastTorpedoEvent.hit ? 60 : 25 });
    }
  }, [lastTorpedoEvent]);

  // Sync view bearing from sub heading initially
  useEffect(() => {
    if (gs) { _viewBearing = gs.heading; setViewBearing(gs.heading); }
  }, [gs?.heading]);

  // Lock-on timer when target selected
  useEffect(() => {
    if (selectedTarget !== null) {
      lockProgressRef.current = 0;
      isLockedRef.current = false;
      const targetIdAtStart = selectedTarget;
      const iv = setInterval(() => {
        lockProgressRef.current = Math.min(lockProgressRef.current + 0.04, 1);
        if (lockProgressRef.current >= 1) {
          clearInterval(iv);
          isLockedRef.current = true;
          // Notify server that lock-on completed — fires WEAPONS_LOCK trigger
          // for any active mission step waiting on it.
          if (targetIdAtStart !== null) lockTarget(targetIdAtStart);
        }
      }, 50);
      return () => clearInterval(iv);
    } else {
      lockProgressRef.current = 0;
      isLockedRef.current = false;
    }
  }, [selectedTarget]);

  // ─── Canvas draw loop (web) ───
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let raf = 0;

    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) { raf = requestAnimationFrame(draw); return; }
      const cont = canvas.parentElement;
      const W = cont?.clientWidth || 400;
      const H = cont?.clientHeight || 280;
      if (Math.abs(canvas.width - W) > 2) canvas.width = W;
      if (Math.abs(canvas.height - H) > 2) canvas.height = H;
      const ctx = canvas.getContext('2d');
      if (!ctx) { raf = requestAnimationFrame(draw); return; }

      const f = frameRef.current;
      const isThermal = visionMode === 'thermal';
      const isNight = visionMode === 'nightops';
      const isStd = !isThermal && !isNight;
      const vb = _viewBearing; // current periscope bearing

      ctx.clearRect(0, 0, W, H);

      // ── SKY ──
      const skyG = ctx.createLinearGradient(0, 0, 0, H * 0.48);
      if (isStd) {
        skyG.addColorStop(0, '#0b1a2e'); // dark navy
        skyG.addColorStop(0.5, '#1a3050');
        skyG.addColorStop(1, '#3a5570');
      } else if (isThermal) {
        skyG.addColorStop(0, '#0a0018'); skyG.addColorStop(1, '#140020');
      } else {
        skyG.addColorStop(0, '#000a00'); skyG.addColorStop(1, '#001a00');
      }
      ctx.fillStyle = skyG; ctx.fillRect(0, 0, W, H * 0.48);

      // Stars (standard only, subtle)
      if (isStd) {
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        for (let i = 0; i < 20; i++) {
          const sx = (i * 137.5 + f * 0.01) % W;
          const sy = 10 + (i * 73.1) % (H * 0.35);
          ctx.fillRect(sx, sy, 1, 1);
        }
      }

      // ── HORIZON ──
      const horizonY = H * 0.48;
      const horizFog = ctx.createLinearGradient(0, horizonY - 20, 0, horizonY + 30);
      if (isStd) {
        horizFog.addColorStop(0, 'rgba(60,90,110,0)');
        horizFog.addColorStop(0.5, 'rgba(80,110,130,0.3)');
        horizFog.addColorStop(1, 'rgba(60,90,110,0)');
      } else if (isThermal) {
        horizFog.addColorStop(0, 'rgba(30,0,40,0)');
        horizFog.addColorStop(0.5, 'rgba(50,0,60,0.4)');
        horizFog.addColorStop(1, 'rgba(30,0,40,0)');
      } else {
        horizFog.addColorStop(0, 'rgba(0,30,0,0)');
        horizFog.addColorStop(0.5, 'rgba(0,50,0,0.3)');
        horizFog.addColorStop(1, 'rgba(0,30,0,0)');
      }
      ctx.fillStyle = horizFog; ctx.fillRect(0, horizonY - 20, W, 50);

      // Horizon line
      ctx.strokeStyle = isStd ? 'rgba(120,160,180,0.25)' : isThermal ? 'rgba(255,0,100,0.15)' : 'rgba(0,255,0,0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, horizonY); ctx.lineTo(W, horizonY); ctx.stroke();

      // ── WATER ──
      const waterG = ctx.createLinearGradient(0, horizonY, 0, H);
      if (isStd) {
        waterG.addColorStop(0, '#1a3848'); waterG.addColorStop(0.4, '#0f2535');
        waterG.addColorStop(1, '#060e18');
      } else if (isThermal) {
        waterG.addColorStop(0, '#08001a'); waterG.addColorStop(1, '#040010');
      } else {
        waterG.addColorStop(0, '#000d00'); waterG.addColorStop(1, '#000500');
      }
      ctx.fillStyle = waterG; ctx.fillRect(0, horizonY, W, H - horizonY);

      // Wave animation
      const waveCol = isStd ? 'rgba(100,160,200,' : isThermal ? 'rgba(255,0,100,' : 'rgba(0,255,0,';
      for (let row = 0; row < 12; row++) {
        const baseY = horizonY + 6 + row * ((H - horizonY) / 12);
        const alpha = 0.06 - row * 0.004;
        if (alpha <= 0) continue;
        ctx.strokeStyle = waveCol + alpha + ')';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        for (let x = 0; x < W; x += 3) {
          const y = baseY + Math.sin(f * 0.015 + x * 0.02 + row) * (2 + row * 0.3)
            + Math.sin(f * 0.008 + x * 0.01) * 1.5;
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // ── BEARING STRIP (compass at top) ──
      const stripH = 28;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, W, stripH);
      ctx.strokeStyle = isStd ? 'rgba(255,255,255,0.1)' : isThermal ? 'rgba(255,0,100,0.15)' : 'rgba(0,255,0,0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, stripH); ctx.lineTo(W, stripH); ctx.stroke();

      // Degrees per pixel
      const fov = 90; // field of view in degrees
      const degPerPx = fov / W;
      const leftDeg = ((vb - fov / 2) % 360 + 360) % 360;

      const cardinals: Record<number, string> = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };

      for (let d = 0; d < 360; d += 2) {
        const diff = ((d - leftDeg + 540) % 360) - 180;
        const px = (diff + fov / 2) / degPerPx;
        if (px < -10 || px > W + 10) continue;

        if (d % 10 === 0) {
          const isMajor = d % 30 === 0;
          ctx.strokeStyle = isStd
            ? `rgba(255,255,255,${isMajor ? 0.5 : 0.2})`
            : isThermal
            ? `rgba(255,0,100,${isMajor ? 0.5 : 0.2})`
            : `rgba(0,255,0,${isMajor ? 0.5 : 0.2})`;
          ctx.lineWidth = isMajor ? 1.5 : 0.8;
          ctx.beginPath(); ctx.moveTo(px, stripH); ctx.lineTo(px, stripH - (isMajor ? 10 : 5)); ctx.stroke();

          if (isMajor) {
            const label = cardinals[d] || String(d).padStart(3, '0');
            ctx.fillStyle = isStd ? 'rgba(255,255,255,0.6)' : isThermal ? 'rgba(255,0,100,0.6)' : 'rgba(0,255,0,0.6)';
            ctx.font = `bold ${d in cardinals ? 10 : 8}px monospace`;
            ctx.textAlign = 'center';
            ctx.fillText(label, px, stripH - 14);
          }
        }
      }

      // Center indicator triangle
      ctx.fillStyle = Colors.red;
      ctx.beginPath();
      ctx.moveTo(W / 2 - 5, stripH); ctx.lineTo(W / 2, stripH - 6); ctx.lineTo(W / 2 + 5, stripH);
      ctx.fill();
      // Current bearing readout
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
      ctx.fillText(String(Math.round(vb)).padStart(3, '0') + '\u00B0', W / 2, stripH + 12);

      // ── ENEMY SHIPS (positioned by actual bearing) ──
      // Pulse-slow contacts (e.g. MT0 deep signal) are excluded — narrative is
      // "below test depth," so they're audible on sonar but invisible through
      // the periscope. They still appear in the target list on the right.
      const liveEnemies = gs?.enemies.filter(
        (e) => !e.destroyed && e.detected && e.style !== 'pulse-slow'
      ) ?? [];
      liveEnemies.forEach((e) => {
        const bearingDiff = ((e.bearing - vb + 540) % 360) - 180;
        const sx = W / 2 + (bearingDiff / degPerPx);
        if (sx < -80 || sx > W + 80) return;

        // Ship size scales inversely with range
        const size = Math.max(20, 70 * (1 - e.range * 0.7));
        const shipY = horizonY - size * 0.15 - (1 - e.range) * 15;
        const isTarget = selectedTarget === e.id;

        // Targeting brackets
        if (isTarget) {
          const ba = 6 + Math.sin(f * 0.05) * 3;
          const locked = isLockedRef.current;
          ctx.strokeStyle = locked ? 'rgba(255,50,50,0.9)' : `rgba(255,150,50,${0.5 + Math.sin(f * 0.1) * 0.3})`;
          ctx.lineWidth = 2;
          const bx = sx - size * 0.8, by = shipY - size * 0.7;
          const bw = size * 1.6, bh = size * 1.4;
          [[bx, by], [bx + bw, by], [bx, by + bh], [bx + bw, by + bh]].forEach(([cx, cy], j) => {
            const dx = j % 2 === 1 ? -1 : 1;
            const dy = j >= 2 ? -1 : 1;
            ctx.beginPath();
            ctx.moveTo(cx, cy + dy * ba); ctx.lineTo(cx, cy); ctx.lineTo(cx + dx * ba, cy);
            ctx.stroke();
          });

          // Lock progress arc
          if (lockProgressRef.current > 0 && lockProgressRef.current < 1) {
            ctx.strokeStyle = `rgba(255,50,50,${0.4 + lockProgressRef.current * 0.6})`;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(sx, shipY, size * 0.9,
              -Math.PI / 2, -Math.PI / 2 + lockProgressRef.current * Math.PI * 2);
            ctx.stroke();
          }
          if (locked) {
            ctx.strokeStyle = 'rgba(255,50,50,0.7)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 4]);
            ctx.beginPath(); ctx.arc(sx, shipY, size * 0.9, 0, Math.PI * 2); ctx.stroke();
            ctx.setLineDash([]);
          }
        }

        drawShipSilhouette(ctx, sx, shipY, size, isTarget, e, isThermal, isNight, f);

        // Name + range label
        ctx.textAlign = 'center';
        if (isTarget) {
          ctx.fillStyle = 'rgba(255,80,80,0.9)';
          ctx.font = 'bold 8px monospace';
          ctx.fillText(e.identified ? e.type : 'CONTACT', sx, shipY - size * 0.65 - 12);
        }
        ctx.fillStyle = isTarget ? 'rgba(255,80,80,0.8)' : 'rgba(180,180,180,0.5)';
        ctx.font = `${isTarget ? 9 : 7}px monospace`;
        ctx.fillText(`${rangeKm(e.range)}km`, sx, shipY - size * 0.6);
      });

      // ── TORPEDO ANIMATION ──
      if (_torpedo) {
        _torpedo.progress += 0.018;
        const t = _torpedo;
        const cx = t.x + (t.targetX - t.x) * t.progress;
        const cy = t.y + (t.targetY - t.y) * t.progress;

        // Torpedo body
        ctx.fillStyle = '#ff8800';
        ctx.beginPath();
        ctx.ellipse(cx, cy, 6, 2, Math.atan2(t.targetY - t.y, t.targetX - t.x), 0, Math.PI * 2);
        ctx.fill();

        // Wake trail
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(t.x, t.y); ctx.lineTo(cx, cy); ctx.stroke();
        ctx.setLineDash([]);

        // Bubble trail
        for (let i = 0; i < 8; i++) {
          const bp = Math.max(0, t.progress - i * 0.02);
          const bx = t.x + (t.targetX - t.x) * bp + (Math.random() - 0.5) * 6;
          const by = t.y + (t.targetY - t.y) * bp + (Math.random() - 0.5) * 4;
          ctx.beginPath(); ctx.arc(bx, by, 1 + Math.random() * 2, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,255,255,${0.15 - i * 0.015})`;
          ctx.fill();
        }

        if (t.progress >= 1) {
          // Arrived — create explosion
          _explosions.push({ x: t.targetX, y: t.targetY, frame: 0, maxFrames: t.hit ? 60 : 30 });
          _torpedo = null;
        }
      }

      // ── EXPLOSIONS ──
      _explosions = _explosions.filter((ex) => {
        ex.frame++;
        const p = ex.frame / ex.maxFrames;
        if (p > 1) return false;

        // Flash (first few frames)
        if (ex.frame < 5) {
          ctx.fillStyle = `rgba(255,200,100,${0.4 * (1 - ex.frame / 5)})`;
          ctx.fillRect(0, 0, W, H);
        }

        // Fireball
        const fbR = 15 + p * 50;
        const fbGrad = ctx.createRadialGradient(ex.x, ex.y, 0, ex.x, ex.y, fbR);
        fbGrad.addColorStop(0, `rgba(255,200,50,${0.9 * (1 - p)})`);
        fbGrad.addColorStop(0.3, `rgba(255,100,0,${0.7 * (1 - p)})`);
        fbGrad.addColorStop(0.7, `rgba(200,50,0,${0.4 * (1 - p)})`);
        fbGrad.addColorStop(1, `rgba(80,20,0,0)`);
        ctx.fillStyle = fbGrad;
        ctx.beginPath(); ctx.arc(ex.x, ex.y, fbR, 0, Math.PI * 2); ctx.fill();

        // Smoke
        if (p > 0.2) {
          const smokeR = 10 + p * 70;
          ctx.fillStyle = `rgba(60,60,60,${0.3 * (1 - p)})`;
          ctx.beginPath();
          ctx.arc(ex.x + Math.sin(f * 0.1) * 5, ex.y - p * 30, smokeR, 0, Math.PI * 2);
          ctx.fill();
        }

        // Debris particles
        if (ex.frame < 30) {
          for (let d = 0; d < 12; d++) {
            const angle = (d / 12) * Math.PI * 2 + ex.frame * 0.05;
            const dist = ex.frame * (2 + d * 0.5);
            const dx = ex.x + Math.cos(angle) * dist;
            const dy = ex.y + Math.sin(angle) * dist - ex.frame * 0.5;
            const sz = 2 + Math.random() * 2;
            ctx.fillStyle = d % 3 === 0 ? `rgba(255,150,0,${0.6 * (1 - p)})` : `rgba(100,100,100,${0.4 * (1 - p)})`;
            ctx.fillRect(dx, dy, sz, sz);
          }
        }

        // Water splash ring
        if (p > 0.1 && p < 0.8) {
          const splashR = 20 + (p - 0.1) * 80;
          ctx.strokeStyle = `rgba(150,200,220,${0.3 * (1 - p)})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(ex.x, ex.y + 10, splashR, splashR * 0.3, 0, 0, Math.PI * 2);
          ctx.stroke();
        }

        return true;
      });

      // ── THERMAL CREATURES ──
      if (isThermal) drawThermalCreatures(ctx, W, H, f);

      // ── VIGNETTE ──
      const vigR = Math.max(W, H) * 0.65;
      const vig = ctx.createRadialGradient(W / 2, H / 2, vigR * 0.5, W / 2, H / 2, vigR);
      vig.addColorStop(0, 'transparent'); vig.addColorStop(1, 'rgba(0,0,0,0.8)');
      ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);

      // ── CROSSHAIR ──
      const chCol = isStd ? 'rgba(255,60,60,' : isThermal ? 'rgba(255,0,100,' : 'rgba(0,255,0,';
      // Outer thin cross
      ctx.strokeStyle = chCol + '0.3)'; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(W / 2 - 60, H / 2); ctx.lineTo(W / 2 - 20, H / 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(W / 2 + 20, H / 2); ctx.lineTo(W / 2 + 60, H / 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(W / 2, H / 2 - 60); ctx.lineTo(W / 2, H / 2 - 20); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(W / 2, H / 2 + 20); ctx.lineTo(W / 2, H / 2 + 60); ctx.stroke();
      // Inner cross
      ctx.strokeStyle = chCol + '0.6)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(W / 2 - 18, H / 2); ctx.lineTo(W / 2 - 6, H / 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(W / 2 + 6, H / 2); ctx.lineTo(W / 2 + 18, H / 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(W / 2, H / 2 - 18); ctx.lineTo(W / 2, H / 2 - 6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(W / 2, H / 2 + 6); ctx.lineTo(W / 2, H / 2 + 18); ctx.stroke();
      // Center dot
      ctx.fillStyle = chCol + '0.7)';
      ctx.beginPath(); ctx.arc(W / 2, H / 2, 2, 0, Math.PI * 2); ctx.fill();
      // Range rings
      [30, 55].forEach((rad) => {
        ctx.strokeStyle = chCol + '0.1)'; ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.arc(W / 2, H / 2, rad, 0, Math.PI * 2); ctx.stroke();
      });

      // ── SCAN LINE ──
      const scanY = (f * 2) % H;
      ctx.strokeStyle = isStd ? 'rgba(255,255,255,0.03)' : isThermal ? 'rgba(255,0,100,0.03)' : 'rgba(0,255,0,0.05)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, scanY); ctx.lineTo(W, scanY); ctx.stroke();

      frameRef.current++;
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [gs, selectedTarget, visionMode]);

  // ─── Drag to spin periscope (web mouse/touch) ───
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const el = canvas.parentElement || canvas;

    const onDown = (e: MouseEvent | TouchEvent) => {
      const cx = 'touches' in e ? e.touches[0].clientX : e.clientX;
      _dragStartX = cx; _dragStartBearing = _viewBearing;
      el.addEventListener('mousemove', onMove as any);
      el.addEventListener('touchmove', onMove as any, { passive: false });
    };
    const onMove = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      const cx = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const dx = cx - _dragStartX;
      const fov = 90;
      const degPerPx = fov / (el.clientWidth || 400);
      _viewBearing = ((_dragStartBearing - dx * degPerPx) % 360 + 360) % 360;
      setViewBearing(Math.round(_viewBearing));
    };
    const onUp = () => {
      el.removeEventListener('mousemove', onMove as any);
      el.removeEventListener('touchmove', onMove as any);
    };

    el.addEventListener('mousedown', onDown as any);
    el.addEventListener('touchstart', onDown as any, { passive: false });
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp);
    return () => {
      el.removeEventListener('mousedown', onDown as any);
      el.removeEventListener('touchstart', onDown as any);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchend', onUp);
    };
  }, [canvasRef.current]);

  if (!gs) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Awaiting game state...</Text>
      </View>
    );
  }

  const liveEnemies = gs.enemies.filter((e) => !e.destroyed);
  const detectedEnemies = liveEnemies.filter((e) => e.detected);
  const target = selectedTarget !== null ? liveEnemies.find((e) => e.id === selectedTarget) : null;
  const hitPct = target ? hitProbability(target.range) : 0;
  const canFire = gs.torps > 0 && selectedTarget !== null && target && !firing && isLockedRef.current;

  const handleFire = useCallback(() => {
    if (!canFire || selectedTarget === null || !target) return;
    setFiring(true);
    playSound('torpedoFire');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

    // Fire IMMEDIATELY on server — server decides hit/miss
    fireTorpedo(selectedTarget);

    // Start local torpedo animation (cosmetic only)
    const canvas = canvasRef.current;
    const W = canvas?.width || 400;
    const H = canvas?.height || 280;
    const fov = 90;
    const degPerPx = fov / W;
    const bearingDiff = ((target.bearing - _viewBearing + 540) % 360) - 180;
    const targetX = W / 2 + bearingDiff / degPerPx;
    const targetY = H * 0.48 - (1 - target.range) * 15;

    _torpedo = {
      x: W / 2, y: H - 20,
      targetX, targetY,
      progress: 0,
      hit: true, // placeholder — real result comes from server via TORPEDO_HIT/MISS
      targetId: selectedTarget,
    };

    // Re-enable firing after animation
    setTimeout(() => {
      setFiring(false);
      // Check if target was destroyed by server state update
      const alive = gs.enemies.find((e) => e.id === selectedTarget && !e.destroyed);
      if (!alive) setSelectedTarget(null);
    }, 2500);
  }, [canFire, selectedTarget, target, gs, fireTorpedo]);

  return (
    <View style={styles.root}>
      {/* LEFT: Periscope */}
      <View style={styles.scopeCol}>
        <View style={styles.periHeader}>
          <View style={styles.periscopeBadge}>
            <View style={styles.periscopeDot} />
            <Text style={styles.periscopeBadgeText}>PERISCOPE \u2014 {gs.depth}m</Text>
          </View>
          <View style={{ flex: 1 }} />
          {(['standard', 'thermal', 'nightops'] as const).map((m) => (
            <TouchableOpacity
              key={m}
              style={[styles.visionBtn, visionMode === m && (
                m === 'thermal' ? styles.visionBtnThermal : m === 'nightops' ? styles.visionBtnNight : styles.visionBtnStd
              )]}
              onPress={() => setVisionMode(m)}
            >
              <Text style={[styles.visionBtnText, visionMode === m && {
                color: m === 'thermal' ? '#ff4400' : m === 'nightops' ? Colors.green : '#fff',
              }]}>
                {m === 'standard' ? '\uD83D\uDD2D STD' : m === 'thermal' ? '\uD83C\uDF21 THERM' : '\uD83C\uDF19 NIGHT'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.periWrap}>
          {Platform.OS === 'web' ? (
            <canvas
              ref={(el) => { canvasRef.current = el as any; }}
              style={{ display: 'block', width: '100%', height: '100%', cursor: 'grab' } as any}
            />
          ) : (
            <View style={styles.fallbackPeri}>
              <Text style={styles.fallbackText}>PERISCOPE VIEW</Text>
              <Text style={styles.fallbackSub}>Drag to rotate \u2022 {detectedEnemies.length} contacts</Text>
            </View>
          )}

          {/* HUD corners */}
          <View style={styles.hudTL}>
            <Text style={styles.hudVal}>{String(Math.round(viewBearing)).padStart(3, '0')}\u00B0</Text>
            <Text style={styles.hudLbl}>VIEW BRG</Text>
          </View>
          <View style={styles.hudTR}>
            <Text style={[styles.hudVal, { color: Colors.red }]}>
              {target ? `${rangeKm(target.range)} km` : '---'}
            </Text>
            <Text style={styles.hudLbl}>RANGE</Text>
          </View>
          <View style={styles.hudBL}>
            <Text style={styles.hudLbl}>DEPTH</Text>
            <Text style={[styles.hudVal, { color: Colors.blue }]}>{gs.depth}m</Text>
          </View>
          <View style={styles.hudBR}>
            <Text style={styles.hudLbl}>STATUS</Text>
            <Text style={[styles.hudVal, {
              color: firing ? Colors.orange : (isLockedRef.current && target) ? Colors.red : target ? Colors.amber : Colors.textDim,
            }]}>
              {firing ? 'TORPEDO AWAY' : target ? (isLockedRef.current ? 'LOCKED' : 'LOCKING...') : 'SCANNING'}
            </Text>
          </View>

          {/* Drag hint */}
          <View style={styles.dragHint}>
            <Text style={styles.dragHintText}>\u2190 DRAG TO ROTATE \u2192</Text>
          </View>
        </View>
      </View>

      {/* RIGHT: Controls */}
      <ScrollView style={styles.controlsCol} contentContainerStyle={styles.controls} showsVerticalScrollIndicator={false}>
          <MissionTaskCard />

          <View style={styles.card}>
            <Text style={styles.cardLabel}>CONTACTS \u2014 SELECT TO LOCK</Text>
            {liveEnemies.length === 0 && (
              <Text style={styles.allDestroyedText}>ALL TARGETS DESTROYED</Text>
            )}
            {liveEnemies.map((enemy) => (
              <TargetRow
                key={enemy.id}
                enemy={enemy}
                selected={selectedTarget === enemy.id}
                viewBearing={viewBearing}
                onSelect={() => {
                  setSelectedTarget((prev) => (prev === enemy.id ? null : enemy.id));
                  // Snap view to target bearing
                  if (selectedTarget !== enemy.id) {
                    _viewBearing = enemy.bearing;
                    setViewBearing(Math.round(enemy.bearing));
                  }
                  Haptics.selectionAsync();
                }}
              />
            ))}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>TORPEDO TUBES</Text>
            <View style={styles.torpRow}>
              <View style={styles.torpTubes}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <View key={i} style={[styles.torpTube, i < gs.torps && styles.torpTubeLoaded]}>
                    {i < gs.torps && <View style={styles.torpTubeInner} />}
                  </View>
                ))}
              </View>
              <View style={styles.torpCounts}>
                <Text style={styles.torpCountVal}>{gs.torps}</Text>
                <Text style={styles.torpCountLbl}>LOADED</Text>
                <Text style={styles.torpReserveLbl}>+{gs.torpReserve} RESERVE</Text>
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.fireBtn, (!canFire || firing) && styles.fireBtnDisabled]}
            onPress={handleFire}
            disabled={!canFire || firing}
            activeOpacity={0.85}
          >
            <Text style={styles.fireBtnLabel}>
              {gs.torps === 0 ? 'NO TORPEDOES' : firing ? '\u21BB  TORPEDO AWAY...' : '\uD83D\uDE80 FIRE TORPEDO'}
            </Text>
          </TouchableOpacity>

          {target && (
            <Text style={styles.lockInfo}>
              {target.identified ? target.type : 'CONTACT'} \u00B7 BRG {bearingLabel(target.bearing)} \u00B7 {hitPct}% HIT
            </Text>
          )}
      </ScrollView>
    </View>
  );
}

// ─── Ship drawing ───
function drawShipSilhouette(
  ctx: CanvasRenderingContext2D,
  sx: number, shipY: number, size: number,
  isTarget: boolean, enemy: Enemy,
  isThermal: boolean, isNight: boolean, frame: number,
) {
  const isStd = !isThermal && !isNight;
  const fillColor = isThermal
    ? (isTarget ? '#ff4400cc' : '#44002288')
    : isNight
    ? (isTarget ? '#00ff44cc' : '#00330088')
    : (isTarget ? '#444444ee' : '#22222288');
  const strokeColor = isThermal
    ? (isTarget ? '#ff4400' : '#660033')
    : isNight
    ? (isTarget ? '#00ff44' : '#003300')
    : (isTarget ? '#888888' : '#444444');

  ctx.fillStyle = fillColor;
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 1.2;

  // Hull (wider, more detailed)
  ctx.beginPath();
  ctx.moveTo(sx - size * 0.7, shipY + size * 0.15);
  ctx.lineTo(sx - size * 0.75, shipY + size * 0.1);
  ctx.lineTo(sx + size * 0.75, shipY + size * 0.1);
  ctx.lineTo(sx + size * 0.7, shipY + size * 0.15);
  ctx.lineTo(sx + size * 0.55, shipY + size * 0.3);
  ctx.lineTo(sx - size * 0.55, shipY + size * 0.3);
  ctx.closePath(); ctx.fill(); ctx.stroke();

  // Superstructure
  ctx.beginPath();
  ctx.moveTo(sx - size * 0.25, shipY + size * 0.1);
  ctx.lineTo(sx - size * 0.2, shipY - size * 0.15);
  ctx.lineTo(sx + size * 0.3, shipY - size * 0.15);
  ctx.lineTo(sx + size * 0.35, shipY + size * 0.1);
  ctx.closePath(); ctx.fill(); ctx.stroke();

  // Bridge
  ctx.fillStyle = isTarget ? (isThermal ? '#ff660044' : isNight ? '#00aa4444' : '#55555544') : '#11111144';
  ctx.beginPath();
  ctx.moveTo(sx - size * 0.1, shipY - size * 0.15);
  ctx.lineTo(sx - size * 0.05, shipY - size * 0.3);
  ctx.lineTo(sx + size * 0.15, shipY - size * 0.3);
  ctx.lineTo(sx + size * 0.2, shipY - size * 0.15);
  ctx.closePath(); ctx.fill(); ctx.stroke();

  // Mast + antenna
  ctx.strokeStyle = strokeColor; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(sx + size * 0.05, shipY - size * 0.3);
  ctx.lineTo(sx + size * 0.05, shipY - size * 0.6);
  ctx.stroke();
  // Antenna crossbar
  ctx.beginPath();
  ctx.moveTo(sx - size * 0.05, shipY - size * 0.5);
  ctx.lineTo(sx + size * 0.15, shipY - size * 0.5);
  ctx.stroke();

  // Running lights (standard mode)
  if (isStd && isTarget) {
    ctx.fillStyle = `rgba(255,0,0,${0.5 + Math.sin(frame * 0.08) * 0.3})`;
    ctx.beginPath(); ctx.arc(sx + size * 0.05, shipY - size * 0.6, 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,200,50,0.3)';
    ctx.beginPath(); ctx.arc(sx, shipY - size * 0.12, 3, 0, Math.PI * 2); ctx.fill();
  }

  // Wake (water disturbance behind ship)
  if (isStd) {
    ctx.strokeStyle = 'rgba(150,200,220,0.15)';
    ctx.lineWidth = 0.8;
    for (let w = 0; w < 3; w++) {
      const wl = size * (0.8 + w * 0.3);
      ctx.beginPath();
      ctx.moveTo(sx - size * 0.5, shipY + size * 0.32 + w * 3);
      ctx.quadraticCurveTo(sx - wl, shipY + size * 0.35 + w * 5, sx - wl * 1.2, shipY + size * 0.3 + w * 4);
      ctx.stroke();
    }
  }

  // Thermal glow
  if (isThermal && isTarget) {
    ctx.shadowColor = '#ff4400'; ctx.shadowBlur = 15;
    ctx.fillStyle = 'rgba(255,68,0,0.08)';
    ctx.beginPath(); ctx.arc(sx, shipY, size * 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
  }
}

// ─── Thermal creatures ───
function drawThermalCreatures(ctx: CanvasRenderingContext2D, W: number, H: number, frame: number) {
  if (Math.random() < 0.003) {
    const type = CREATURE_TYPES[Math.floor(Math.random() * CREATURE_TYPES.length)];
    if (type.kind === 'leviathan' && Math.random() > 0.1) return;
    _creatures.push({
      type, x: Math.random() > 0.5 ? -type.width : W + type.width,
      y: H * 0.55 + Math.random() * (H * 0.35),
      vx: (Math.random() > 0.5 ? 1 : -1) * (0.3 + Math.random() * 0.5),
      alpha: 0.4 + Math.random() * 0.4, spawnTime: frame,
    });
  }
  for (let i = _creatures.length - 1; i >= 0; i--) {
    const c = _creatures[i];
    c.x += c.vx;
    const age = frame - c.spawnTime;
    const a = age > 300 ? Math.max(0, c.alpha * (1 - (age - 300) / 100)) : c.alpha;
    if (a <= 0 || c.x < -100 || c.x > W + 100) { _creatures.splice(i, 1); continue; }
    ctx.globalAlpha = a;
    ctx.fillStyle = c.type.color;
    if (c.type.kind === 'squid') {
      ctx.beginPath(); ctx.ellipse(c.x, c.y, c.type.width / 2, c.type.height / 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = c.type.color; ctx.lineWidth = 1.5;
      for (let t = 0; t < 6; t++) {
        const bx = c.x - c.type.width * 0.3 + t * c.type.width * 0.12;
        ctx.beginPath(); ctx.moveTo(bx, c.y + c.type.height / 2);
        ctx.quadraticCurveTo(bx + Math.sin(frame * 0.03 + t) * 8, c.y + c.type.height + 5,
          bx + Math.sin(frame * 0.02 + t * 2) * 12, c.y + c.type.height + 15);
        ctx.stroke();
      }
    } else if (c.type.kind === 'angler') {
      ctx.beginPath(); ctx.ellipse(c.x, c.y, c.type.width / 2, c.type.height / 2, 0, 0, Math.PI * 2); ctx.fill();
      const lx = c.x + c.type.width * 0.4, ly = c.y - c.type.height * 0.6 + Math.sin(frame * 0.05) * 3;
      ctx.strokeStyle = c.type.color; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(c.x + c.type.width * 0.2, c.y - c.type.height * 0.3);
      ctx.quadraticCurveTo(lx, ly - 5, lx, ly); ctx.stroke();
      ctx.fillStyle = '#ffff00'; ctx.beginPath();
      ctx.arc(lx, ly, 3 + Math.sin(frame * 0.1), 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.beginPath(); ctx.ellipse(c.x, c.y, c.type.width / 2, c.type.height / 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff0000'; ctx.beginPath();
      ctx.arc(c.x + c.type.width * 0.35, c.y - c.type.height * 0.1, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = c.type.color; ctx.beginPath();
      ctx.moveTo(c.x - c.type.width * 0.5, c.y);
      ctx.lineTo(c.x - c.type.width * 0.7, c.y - c.type.height * 0.5);
      ctx.lineTo(c.x - c.type.width * 0.5, c.y + 2);
      ctx.lineTo(c.x - c.type.width * 0.7, c.y + c.type.height * 0.5); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

function TargetRow({ enemy, selected, viewBearing, onSelect }: {
  enemy: Enemy; selected: boolean; viewBearing: number; onSelect: () => void;
}) {
  const hitPct = hitProbability(enemy.range);
  const hitCol = hitPct > 70 ? Colors.green : hitPct > 50 ? Colors.amber : Colors.red;
  const bearingDiff = Math.abs(((enemy.bearing - viewBearing + 540) % 360) - 180);
  const inView = bearingDiff < 45;
  // Pulse-slow contacts (e.g. MT0 deep signal) use the contact's own color
  // and a distinct label so weapons can see they exist but aren't a normal
  // tactical target. They are NOT visible through the periscope visual.
  const isPulseSlow = enemy.style === 'pulse-slow';
  const dotColor = isPulseSlow
    ? (enemy.col || '#00e5cc')
    : (enemy.identified ? Colors.red : Colors.amber);
  const nameColor = isPulseSlow
    ? (enemy.col || '#00e5cc')
    : enemy.detected ? (enemy.identified ? '#ccc' : '#886600') : Colors.textDim;
  return (
    <TouchableOpacity
      style={[styles.targetRow, selected && styles.targetRowSelected]}
      onPress={onSelect} activeOpacity={0.8}
    >
      <View style={[styles.targetDot, {
        backgroundColor: dotColor,
        opacity: enemy.detected ? 1 : 0.4,
      }]} />
      <Text style={[styles.targetName, { color: nameColor }]}>
        {enemy.identified
          ? enemy.type
          : isPulseSlow
          ? enemy.type
          : enemy.detected
          ? 'CONTACT'
          : 'UNDETECTED'}
      </Text>
      <Text style={styles.targetBearing}>{bearingLabel(enemy.bearing)}</Text>
      <Text style={[styles.targetRange, { color: enemy.range < 0.3 ? Colors.red : Colors.amber }]}>
        {rangeKm(enemy.range)}km
      </Text>
      <Text style={[styles.targetHitPct, { color: hitCol }]}>{hitPct}%</Text>
      {inView && !isPulseSlow && <Text style={styles.inViewBadge}>{'\u25C9'}</Text>}
      {selected && <Text style={styles.lockIcon}>{'\uD83D\uDD12'}</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row' },
  scopeCol: { flex: 1, backgroundColor: '#000' },
  periHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,51,51,0.2)',
  },
  periscopeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,51,51,0.1)', borderWidth: 1,
    borderColor: 'rgba(255,51,51,0.4)', borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  periscopeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.red },
  periscopeBadgeText: { fontFamily: 'Orbitron_400Regular', fontSize: 7, letterSpacing: 1, color: Colors.red },
  visionBtn: {
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 5,
    paddingHorizontal: 8, paddingVertical: 5,
  },
  visionBtnStd: { borderColor: '#fff', backgroundColor: 'rgba(255,255,255,0.08)' },
  visionBtnThermal: { borderColor: '#ff4400', backgroundColor: 'rgba(255,68,0,0.08)' },
  visionBtnNight: { borderColor: Colors.green, backgroundColor: 'rgba(0,255,0,0.08)' },
  visionBtnText: { fontFamily: 'Orbitron_400Regular', fontSize: 7, letterSpacing: 1, color: '#555' },
  periWrap: { flex: 1, backgroundColor: '#000', position: 'relative', overflow: 'hidden' },
  fallbackPeri: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#050e08' },
  fallbackText: { fontFamily: 'Orbitron_700Bold', fontSize: 12, color: Colors.red, letterSpacing: 2 },
  fallbackSub: { fontFamily: 'ShareTechMono_400Regular', fontSize: 9, color: Colors.textDim, marginTop: 4 },
  hudTL: { position: 'absolute', top: 36, left: 10, zIndex: 4 },
  hudTR: { position: 'absolute', top: 36, right: 10, zIndex: 4, alignItems: 'flex-end' },
  hudBL: { position: 'absolute', bottom: 10, left: 10, zIndex: 4 },
  hudBR: { position: 'absolute', bottom: 10, right: 10, zIndex: 4, alignItems: 'flex-end' },
  hudVal: { fontFamily: 'Orbitron_700Bold', fontSize: 11, color: 'rgba(255,255,255,0.7)', letterSpacing: 1 },
  hudLbl: { fontFamily: 'Orbitron_400Regular', fontSize: 6, color: 'rgba(255,255,255,0.25)', letterSpacing: 1 },
  dragHint: {
    position: 'absolute', bottom: 40, left: 0, right: 0, alignItems: 'center', zIndex: 4,
  },
  dragHintText: {
    fontFamily: 'ShareTechMono_400Regular', fontSize: 8, color: 'rgba(255,255,255,0.15)', letterSpacing: 2,
  },
  controlsCol: { width: '44%' as any, maxWidth: 380, borderLeftWidth: 1, borderLeftColor: 'rgba(255,51,51,0.12)' },
  controls: { padding: 12, gap: 10 },
  card: { backgroundColor: Colors.bgCard2, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, padding: 12 },
  cardLabel: { fontFamily: 'Orbitron_400Regular', fontSize: 7, color: Colors.textDim, letterSpacing: 2, marginBottom: 8 },
  allDestroyedText: { fontFamily: 'Orbitron_700Bold', fontSize: 11, color: Colors.green, textAlign: 'center', paddingVertical: 12, letterSpacing: 1 },
  targetRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.bgCard3, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10, marginBottom: 5,
  },
  targetRowSelected: { borderColor: Colors.red, backgroundColor: 'rgba(255,51,51,0.06)' },
  targetDot: { width: 8, height: 8, borderRadius: 4 },
  targetName: { flex: 1, fontFamily: 'Orbitron_400Regular', fontSize: 9, letterSpacing: 1 },
  targetBearing: { fontFamily: 'Orbitron_400Regular', fontSize: 9, color: Colors.amber, minWidth: 40, textAlign: 'right' },
  targetRange: { fontFamily: 'ShareTechMono_400Regular', fontSize: 9, minWidth: 35, textAlign: 'right' },
  targetHitPct: { fontFamily: 'Orbitron_400Regular', fontSize: 9, minWidth: 30, textAlign: 'right' },
  inViewBadge: { fontSize: 10, color: Colors.green },
  lockIcon: { fontSize: 12, marginLeft: 2 },
  torpRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  torpTubes: { flexDirection: 'row', gap: 5, flexWrap: 'wrap' },
  torpTube: {
    width: 22, height: 40, borderRadius: 11, borderWidth: 1,
    borderColor: Colors.border, backgroundColor: Colors.bgCard3,
    alignItems: 'center', justifyContent: 'center',
  },
  torpTubeLoaded: { borderColor: Colors.orange, backgroundColor: 'rgba(255,102,0,0.12)' },
  torpTubeInner: { width: 7, height: 26, borderRadius: 4, backgroundColor: Colors.orange },
  torpCounts: { marginLeft: 6 },
  torpCountVal: { fontFamily: 'Orbitron_900Black', fontSize: 18, color: Colors.orange },
  torpCountLbl: { fontFamily: 'ShareTechMono_400Regular', fontSize: 8, color: '#444', letterSpacing: 1 },
  torpReserveLbl: { fontFamily: 'ShareTechMono_400Regular', fontSize: 8, color: '#444' },
  fireBtn: {
    paddingVertical: 16, backgroundColor: 'rgba(255,51,51,0.08)',
    borderWidth: 2, borderColor: Colors.red, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  fireBtnDisabled: { opacity: 0.25 },
  fireBtnLabel: { fontFamily: 'Orbitron_900Black', fontSize: 14, color: Colors.red, letterSpacing: 3 },
  lockInfo: { fontFamily: 'ShareTechMono_400Regular', fontSize: 9, color: 'rgba(255,179,0,0.5)', textAlign: 'center', letterSpacing: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontFamily: 'ShareTechMono_400Regular', fontSize: 12, color: Colors.textDim },
});
