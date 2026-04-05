import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  Platform,
} from 'react-native';
import { useGame, Enemy } from '@/contexts/GameContext';
import { Colors } from '@/constants/Colors';
import { bearingLabel, rangeKm, hitProbability } from '@/utils/bearingMath';
import { playSound } from '@/utils/sounds';
import * as Haptics from 'expo-haptics';
import { MissionTaskCard } from '@/components/game/MissionTaskCard';

type VisionMode = 'standard' | 'thermal' | 'nightops';

// Thermal creature types for easter-egg sightings
const CREATURE_TYPES = [
  { name: 'GIANT SQUID', width: 40, height: 25, color: '#ff4400', tentacles: true },
  { name: 'ANGLERFISH', width: 20, height: 14, color: '#ffaa00', lure: true },
  { name: 'LEVIATHAN', width: 80, height: 30, color: '#ff2200', rare: true },
];

interface ThermalCreature {
  type: typeof CREATURE_TYPES[number];
  x: number;
  y: number;
  vx: number;
  alpha: number;
  spawnTime: number;
}

export function WeaponsStation() {
  const { gameState, fireTorpedo } = useGame();
  const [selectedTarget, setSelectedTarget] = useState<number | null>(null);
  const [firing, setFiring] = useState(false);
  const [visionMode, setVisionMode] = useState<VisionMode>('standard');
  const [weaponsMode, setWeaponsMode] = useState<'periscope' | 'firecontrol'>('periscope');
  const lockAnim = useRef(new Animated.Value(0)).current;

  // Canvas refs for periscope
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const periAnimRef = useRef(0);
  const periOffsetRef = useRef(0);
  const lockProgressRef = useRef(0);
  const isLockedRef = useRef(false);
  // creaturesRef is module-level (below) so drawThermalCreatures can access it

  const gs = gameState;

  // Lock animation
  useEffect(() => {
    if (selectedTarget !== null) {
      lockProgressRef.current = 0;
      isLockedRef.current = false;
      const interval = setInterval(() => {
        lockProgressRef.current = Math.min(lockProgressRef.current + 0.06, 1);
        if (lockProgressRef.current >= 1) {
          clearInterval(interval);
          isLockedRef.current = true;
        }
      }, 50);
      Animated.loop(
        Animated.sequence([
          Animated.timing(lockAnim, { toValue: 1, duration: 400, useNativeDriver: false }),
          Animated.timing(lockAnim, { toValue: 0, duration: 400, useNativeDriver: false }),
        ])
      ).start();
      return () => { clearInterval(interval); lockAnim.stopAnimation(); };
    } else {
      lockProgressRef.current = 0;
      isLockedRef.current = false;
      lockAnim.stopAnimation();
      lockAnim.setValue(0);
    }
  }, [selectedTarget]);

  // Periscope canvas draw loop (web only)
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let raf = 0;

    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) { raf = requestAnimationFrame(draw); return; }
      const container = canvas.parentElement;
      const W = container?.clientWidth || 360;
      canvas.width = W;
      canvas.height = container?.clientHeight || 280;
      const H = canvas.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { raf = requestAnimationFrame(draw); return; }
      ctx.clearRect(0, 0, W, H);

      const isThermal = visionMode === 'thermal';
      const isNight = visionMode === 'nightops';
      const frame = periAnimRef.current;

      // Sky
      const skyGrad = ctx.createLinearGradient(0, 0, 0, H * 0.55);
      if (isThermal) {
        skyGrad.addColorStop(0, '#0a0018');
        skyGrad.addColorStop(1, '#140020');
      } else if (isNight) {
        skyGrad.addColorStop(0, '#000a00');
        skyGrad.addColorStop(1, '#001a00');
      } else {
        skyGrad.addColorStop(0, '#050e08');
        skyGrad.addColorStop(1, '#0a1a10');
      }
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, W, H * 0.55);

      // Horizon fog
      ctx.fillStyle = isThermal ? 'rgba(30,0,40,0.5)' : isNight ? 'rgba(0,30,0,0.5)' : 'rgba(0,30,15,0.5)';
      ctx.fillRect(0, H * 0.45, W, H * 0.15);

      // Water
      const waterGrad = ctx.createLinearGradient(0, H * 0.5, 0, H);
      if (isThermal) {
        waterGrad.addColorStop(0, '#08001a');
        waterGrad.addColorStop(1, '#040010');
      } else if (isNight) {
        waterGrad.addColorStop(0, '#000d00');
        waterGrad.addColorStop(1, '#000500');
      } else {
        waterGrad.addColorStop(0, '#020d0a');
        waterGrad.addColorStop(1, '#000503');
      }
      ctx.fillStyle = waterGrad;
      ctx.fillRect(0, H * 0.5, W, H * 0.5);

      // Water shimmer lines
      const shimmerColor = isThermal ? 'rgba(255,0,100,0.04)' : isNight ? 'rgba(0,255,0,0.04)' : 'rgba(0,255,136,0.04)';
      ctx.strokeStyle = shimmerColor;
      ctx.lineWidth = 1;
      for (let i = 0; i < 8; i++) {
        const y = H * 0.52 + i * 8 + Math.sin(frame * 0.02 + i) * 3;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }

      // Distant waves
      ctx.strokeStyle = isThermal ? 'rgba(80,0,40,0.3)' : isNight ? 'rgba(0,80,0,0.3)' : 'rgba(0,80,40,0.3)';
      ctx.lineWidth = 0.5;
      for (let i = 0; i < 20; i++) {
        const wx = (periOffsetRef.current * 0.3 + i * 50) % W;
        const wy = H * 0.51 + Math.sin(frame * 0.01 + i) * 2;
        ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(wx + 20, wy + 1); ctx.stroke();
      }

      // Horizon line
      ctx.strokeStyle = isThermal ? 'rgba(255,0,100,0.15)' : isNight ? 'rgba(0,255,0,0.15)' : 'rgba(0,255,136,0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, H * 0.52); ctx.lineTo(W, H * 0.52); ctx.stroke();

      // === ENEMY SHIPS ===
      const liveEnemies = gs?.enemies.filter((e) => !e.destroyed) ?? [];
      liveEnemies.forEach((e, i) => {
        if (!e.detected) return;
        const shipSize = 40 + (e.strength || 0.5) * 30;
        const scroll = (periOffsetRef.current * 0.5) % (W * 2);
        const normX = (e.bearing % 360) / 360;
        const sx = (normX * W * 2 - scroll + W * 2) % (W * 2) - W * 0.5;
        if (sx < -shipSize || sx > W + shipSize) return;

        const isTarget = selectedTarget === e.id;
        const shipY = H * 0.52 - shipSize * 0.3;

        // Targeting brackets
        if (isTarget) {
          const bracketA = 4 + Math.sin(frame * 0.05) * 2;
          const locked = isLockedRef.current;
          ctx.strokeStyle = `rgba(255,${locked ? 50 : 150},50,${locked ? 0.9 : 0.5 + Math.sin(frame * 0.1) * 0.3})`;
          ctx.lineWidth = 1.5;
          const bx = sx - shipSize * 0.7, by = shipY - shipSize * 0.6;
          const bw = shipSize * 1.4, bh = shipSize * 1.2;
          const corners = [
            [bx, by], [bx + bw, by], [bx, by + bh], [bx + bw, by + bh],
          ];
          corners.forEach(([cx, cy], j) => {
            const sx2 = j % 2 === 1 ? -1 : 1;
            const sy2 = j >= 2 ? -1 : 1;
            ctx.beginPath();
            ctx.moveTo(cx, cy + sy2 * bracketA);
            ctx.lineTo(cx, cy);
            ctx.lineTo(cx + sx2 * bracketA, cy);
            ctx.stroke();
          });

          // Lock progress arc
          if (lockProgressRef.current > 0) {
            ctx.strokeStyle = `rgba(255,50,50,${0.5 + lockProgressRef.current * 0.5})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(sx, shipY - shipSize * 0.1, shipSize * 0.8,
              -(Math.PI / 2),
              -(Math.PI / 2) + lockProgressRef.current * Math.PI * 2);
            ctx.stroke();
          }
        }

        // Draw ship silhouette
        drawShipSilhouette(ctx, sx, shipY, shipSize, isTarget, e, isThermal, isNight);

        // Range label
        ctx.fillStyle = isTarget ? 'rgba(255,50,50,0.8)' : 'rgba(150,150,150,0.5)';
        ctx.font = `${isTarget ? 9 : 7}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(`${rangeKm(e.range)}km`, sx, shipY - shipSize * 0.6);
        if (isTarget && e.identified) {
          ctx.fillStyle = 'rgba(255,100,100,0.8)';
          ctx.font = '8px monospace';
          ctx.fillText(e.type, sx, shipY - shipSize * 0.6 - 12);
        }
      });

      // === THERMAL CREATURES ===
      if (isThermal) {
        drawThermalCreatures(ctx, W, H, frame);
      }

      // Degrees scale at top
      const scaleColor = isThermal ? 'rgba(255,0,100,0.4)' : isNight ? 'rgba(0,255,0,0.4)' : 'rgba(0,255,136,0.4)';
      ctx.fillStyle = scaleColor;
      ctx.font = '7px monospace';
      ctx.textAlign = 'center';
      for (let deg = 0; deg < 360; deg += 10) {
        const posX = (deg / 360 * W * 2 - periOffsetRef.current * 0.8 + W) % (W * 2);
        if (posX >= 0 && posX <= W) {
          ctx.fillText(String(deg).padStart(3, '0'), posX, 14);
          ctx.strokeStyle = scaleColor;
          ctx.lineWidth = 0.5;
          ctx.beginPath(); ctx.moveTo(posX, 18); ctx.lineTo(posX, 24); ctx.stroke();
        }
      }

      // Green scan flicker
      if (Math.random() > 0.97) {
        ctx.fillStyle = isThermal ? 'rgba(255,0,100,0.015)' : isNight ? 'rgba(0,255,0,0.015)' : 'rgba(0,255,136,0.015)';
        ctx.fillRect(0, 0, W, H);
      }

      // Vignette
      const vigGrad = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
      vigGrad.addColorStop(0, 'transparent');
      vigGrad.addColorStop(1, 'rgba(0,0,0,0.85)');
      ctx.fillStyle = vigGrad;
      ctx.fillRect(0, 0, W, H);

      // Crosshair
      const chColor = isThermal ? 'rgba(255,0,100,0.6)' : isNight ? 'rgba(0,255,0,0.6)' : 'rgba(255,0,0,0.6)';
      ctx.strokeStyle = chColor;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(W / 2 - 30, H / 2); ctx.lineTo(W / 2 + 30, H / 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(W / 2, H / 2 - 30); ctx.lineTo(W / 2, H / 2 + 30); ctx.stroke();
      ctx.beginPath(); ctx.arc(W / 2, H / 2, 22, 0, Math.PI * 2);
      ctx.strokeStyle = chColor.replace('0.6', '0.4');
      ctx.stroke();

      // Range rings
      [40, 70, 100].forEach((rad) => {
        ctx.beginPath(); ctx.arc(W / 2, H / 2, rad, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,0,0,0.08)';
        ctx.lineWidth = 1; ctx.stroke();
      });

      periAnimRef.current++;
      periOffsetRef.current += 0.4;
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [gs, selectedTarget, visionMode]);

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
  const canFire = gs.torps > 0 && selectedTarget !== null && target && !firing;

  const handleFire = () => {
    if (!canFire || selectedTarget === null) return;
    setFiring(true);
    playSound('torpedoFire');
    fireTorpedo(selectedTarget);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setTimeout(() => {
      setFiring(false);
      if (liveEnemies.find((e) => e.id === selectedTarget)?.destroyed) {
        setSelectedTarget(null);
      }
    }, 2000);
  };

  return (
    <View style={styles.root}>
      {/* LEFT: Periscope view */}
      <View style={styles.scopeCol}>
        {/* Header */}
        <View style={styles.periHeader}>
          <View style={styles.periscopeBadge}>
            <View style={styles.periscopeDot} />
            <Text style={styles.periscopeBadgeText}>PERISCOPE DEPTH \u2014 18m</Text>
          </View>
          <View style={{ flex: 1 }} />
          {/* Vision mode buttons */}
          <TouchableOpacity
            style={[styles.visionBtn, visionMode === 'standard' && styles.visionBtnActive]}
            onPress={() => setVisionMode('standard')}
          >
            <Text style={[styles.visionBtnText, visionMode === 'standard' && styles.visionBtnTextActive]}>
              STANDARD
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.visionBtn, visionMode === 'thermal' && styles.visionBtnActiveThermal]}
            onPress={() => setVisionMode('thermal')}
          >
            <Text style={[styles.visionBtnText, visionMode === 'thermal' && { color: '#ff4400' }]}>
              THERMAL
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.visionBtn, visionMode === 'nightops' && styles.visionBtnActiveNight]}
            onPress={() => setVisionMode('nightops')}
          >
            <Text style={[styles.visionBtnText, visionMode === 'nightops' && { color: Colors.green }]}>
              NIGHT OPS
            </Text>
          </TouchableOpacity>
        </View>

        {/* Canvas */}
        <View style={styles.periWrap}>
          {Platform.OS === 'web' ? (
            <canvas
              ref={(el) => { canvasRef.current = el as any; }}
              style={{ display: 'block', width: '100%', height: '100%' } as any}
            />
          ) : (
            <View style={styles.fallbackPeri}>
              <Text style={styles.fallbackText}>PERISCOPE VIEW</Text>
              <Text style={styles.fallbackSub}>{detectedEnemies.length} targets visible</Text>
            </View>
          )}

          {/* HUD overlays */}
          <View style={styles.hudTL}>
            <Text style={styles.hudVal}>{bearingLabel(gs.heading)}</Text>
            <Text style={styles.hudLbl}>BEARING</Text>
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
              color: isLockedRef.current && target ? Colors.red : Colors.amber,
            }]}>
              {target ? (isLockedRef.current ? 'LOCKED' : 'LOCKING...') : 'SCANNING'}
            </Text>
          </View>
        </View>
      </View>

      {/* RIGHT: Controls */}
      <View style={styles.controlsCol}>
        <View style={styles.controls}>
          <MissionTaskCard />

          {/* Targets */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>DETECTED CONTACTS \u2014 SELECT TO LOCK</Text>
            {liveEnemies.length === 0 && (
              <Text style={styles.allDestroyedText}>ALL TARGETS DESTROYED</Text>
            )}
            {liveEnemies.map((enemy) => (
              <TargetRow
                key={enemy.id}
                enemy={enemy}
                selected={selectedTarget === enemy.id}
                onSelect={() => {
                  setSelectedTarget((prev) => (prev === enemy.id ? null : enemy.id));
                  Haptics.selectionAsync();
                }}
              />
            ))}
          </View>

          {/* Torpedo tubes */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>TORPEDO TUBES</Text>
            <View style={styles.torpRow}>
              <View style={styles.torpTubes}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <View
                    key={i}
                    style={[styles.torpTube, i < gs.torps && styles.torpTubeLoaded]}
                  >
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

          {/* Fire button */}
          <TouchableOpacity
            style={[styles.fireBtn, (!canFire || firing) && styles.fireBtnDisabled]}
            onPress={handleFire}
            disabled={!canFire}
            activeOpacity={0.85}
          >
            <Text style={styles.fireBtnLabel}>
              {gs.torps === 0
                ? 'NO TORPEDOES'
                : firing
                ? '\u21BB  FIRING...'
                : '\u25C9  FIRE TORPEDO'}
            </Text>
          </TouchableOpacity>

          {target && (
            <Text style={styles.lockInfo}>
              TARGET LOCKED: {target.identified ? target.type : 'UNKNOWN'} \u00B7 HIT PROBABILITY: {hitPct}%
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

function drawShipSilhouette(
  ctx: CanvasRenderingContext2D,
  sx: number, shipY: number, size: number,
  isTarget: boolean, enemy: Enemy,
  isThermal: boolean, isNight: boolean,
) {
  const fillColor = isThermal
    ? (isTarget ? '#ff4400cc' : '#440022aa')
    : isNight
    ? (isTarget ? '#00ff44cc' : '#003300aa')
    : (isTarget ? `${enemy.col || '#cc3333'}cc` : 'rgba(40,40,40,0.9)');
  const strokeColor = isThermal
    ? (isTarget ? '#ff4400' : '#440022')
    : isNight
    ? (isTarget ? '#00ff44' : '#003300')
    : (isTarget ? (enemy.col || '#cc3333') : 'rgba(80,80,80,0.5)');

  ctx.fillStyle = fillColor;
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 1;

  // Hull
  ctx.beginPath();
  ctx.moveTo(sx - size * 0.6, shipY + size * 0.15);
  ctx.lineTo(sx + size * 0.6, shipY + size * 0.15);
  ctx.lineTo(sx + size * 0.5, shipY + size * 0.3);
  ctx.lineTo(sx - size * 0.5, shipY + size * 0.3);
  ctx.closePath(); ctx.fill(); ctx.stroke();

  // Superstructure
  ctx.beginPath();
  ctx.moveTo(sx - size * 0.2, shipY - size * 0.1);
  ctx.lineTo(sx + size * 0.3, shipY - size * 0.1);
  ctx.lineTo(sx + size * 0.25, shipY + size * 0.15);
  ctx.lineTo(sx - size * 0.15, shipY + size * 0.15);
  ctx.closePath(); ctx.fill(); ctx.stroke();

  // Mast
  ctx.strokeStyle = isTarget ? strokeColor : 'rgba(80,80,80,0.7)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(sx, shipY - size * 0.1);
  ctx.lineTo(sx, shipY - size * 0.5);
  ctx.stroke();

  // Thermal glow
  if (isThermal && isTarget) {
    ctx.shadowColor = '#ff4400';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(sx, shipY, size * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,68,0,0.1)';
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

function drawThermalCreatures(
  ctx: CanvasRenderingContext2D,
  W: number, H: number, frame: number,
) {
  // Spawn creatures occasionally
  if (Math.random() < 0.003) {
    const type = CREATURE_TYPES[Math.floor(Math.random() * CREATURE_TYPES.length)];
    // Rare leviathan check
    if (type.rare && Math.random() > 0.1) return;
    const creature: ThermalCreature = {
      type,
      x: Math.random() > 0.5 ? -type.width : W + type.width,
      y: H * 0.55 + Math.random() * (H * 0.35),
      vx: (Math.random() > 0.5 ? 1 : -1) * (0.3 + Math.random() * 0.5),
      alpha: 0.4 + Math.random() * 0.4,
      spawnTime: frame,
    };
    creaturesRef.current.push(creature);
  }

  // Update and draw
  creaturesRef.current = creaturesRef.current.filter((c) => {
    c.x += c.vx;
    const age = frame - c.spawnTime;
    const fadeAlpha = age > 300 ? Math.max(0, c.alpha * (1 - (age - 300) / 100)) : c.alpha;
    if (fadeAlpha <= 0 || c.x < -100 || c.x > W + 100) return false;

    ctx.globalAlpha = fadeAlpha;

    if (c.type.tentacles) {
      // Giant squid — body + tentacles
      ctx.fillStyle = c.type.color;
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, c.type.width / 2, c.type.height / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      // Tentacles
      ctx.strokeStyle = c.type.color;
      ctx.lineWidth = 1.5;
      for (let t = 0; t < 6; t++) {
        const baseX = c.x - c.type.width * 0.3 + t * (c.type.width * 0.12);
        ctx.beginPath();
        ctx.moveTo(baseX, c.y + c.type.height / 2);
        ctx.quadraticCurveTo(
          baseX + Math.sin(frame * 0.03 + t) * 8,
          c.y + c.type.height + 5,
          baseX + Math.sin(frame * 0.02 + t * 2) * 12,
          c.y + c.type.height + 15
        );
        ctx.stroke();
      }
    } else if (c.type.lure) {
      // Anglerfish — body + glowing lure
      ctx.fillStyle = c.type.color;
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, c.type.width / 2, c.type.height / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      // Lure
      const lureX = c.x + c.type.width * 0.4;
      const lureY = c.y - c.type.height * 0.6 + Math.sin(frame * 0.05) * 3;
      ctx.strokeStyle = c.type.color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(c.x + c.type.width * 0.2, c.y - c.type.height * 0.3);
      ctx.quadraticCurveTo(lureX, lureY - 5, lureX, lureY);
      ctx.stroke();
      // Glow
      ctx.beginPath(); ctx.arc(lureX, lureY, 3 + Math.sin(frame * 0.1) * 1, 0, Math.PI * 2);
      ctx.fillStyle = '#ffff00';
      ctx.fill();
    } else {
      // Leviathan — massive elongated shape
      ctx.fillStyle = c.type.color;
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, c.type.width / 2, c.type.height / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      // Eye
      ctx.beginPath();
      ctx.arc(c.x + c.type.width * 0.35, c.y - c.type.height * 0.1, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ff0000';
      ctx.fill();
      // Tail fins
      ctx.beginPath();
      ctx.moveTo(c.x - c.type.width * 0.5, c.y);
      ctx.lineTo(c.x - c.type.width * 0.7, c.y - c.type.height * 0.5);
      ctx.lineTo(c.x - c.type.width * 0.5, c.y + 2);
      ctx.lineTo(c.x - c.type.width * 0.7, c.y + c.type.height * 0.5);
      ctx.fillStyle = c.type.color;
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    return true;
  });
}


// Module-level so drawThermalCreatures can mutate it
const creaturesRef = { current: [] as ThermalCreature[] };

function TargetRow({
  enemy,
  selected,
  onSelect,
}: {
  enemy: Enemy;
  selected: boolean;
  onSelect: () => void;
}) {
  const hitPct = hitProbability(enemy.range);
  const hitColor = hitPct > 70 ? Colors.green : hitPct > 50 ? Colors.amber : Colors.red;
  return (
    <TouchableOpacity
      style={[styles.targetRow, selected && styles.targetRowSelected]}
      onPress={onSelect}
      activeOpacity={0.8}
    >
      <View
        style={[
          styles.targetDot,
          {
            backgroundColor: enemy.identified ? Colors.red : Colors.amber,
            opacity: enemy.detected ? 1 : 0.4,
          },
        ]}
      />
      <Text
        style={[
          styles.targetName,
          { color: enemy.detected ? (enemy.identified ? '#ccc' : '#886600') : Colors.textDim },
        ]}
      >
        {enemy.identified ? enemy.type : enemy.detected ? 'UNIDENTIFIED' : 'UNDETECTED'}
      </Text>
      <Text style={styles.targetBearing}>{bearingLabel(enemy.bearing)}</Text>
      <Text style={[styles.targetRange, { color: enemy.range < 0.3 ? Colors.red : Colors.amber }]}>
        {rangeKm(enemy.range)}km
      </Text>
      <Text style={[styles.targetHitPct, { color: hitColor }]}>{hitPct}%</Text>
      {selected && (
        <Text style={styles.lockIcon}>{'\uD83D\uDD12'}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row' },

  // Periscope column
  scopeCol: {
    flex: 1,
    backgroundColor: '#000',
  },
  periHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,51,51,0.2)',
  },
  periscopeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,51,51,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,51,51,0.4)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  periscopeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.red,
  },
  periscopeBadgeText: {
    fontFamily: 'Orbitron_400Regular',
    fontSize: 8,
    letterSpacing: 1,
    color: Colors.red,
  },
  visionBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  visionBtnActive: {
    borderColor: Colors.red,
    backgroundColor: 'rgba(255,51,51,0.08)',
  },
  visionBtnActiveThermal: {
    borderColor: '#ff4400',
    backgroundColor: 'rgba(255,68,0,0.08)',
  },
  visionBtnActiveNight: {
    borderColor: Colors.green,
    backgroundColor: 'rgba(0,255,0,0.08)',
  },
  visionBtnText: {
    fontFamily: 'Orbitron_400Regular',
    fontSize: 7,
    letterSpacing: 1,
    color: '#444',
  },
  visionBtnTextActive: { color: Colors.red },
  periWrap: {
    flex: 1,
    backgroundColor: '#000',
    position: 'relative',
    overflow: 'hidden',
  },
  fallbackPeri: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#050e08',
  },
  fallbackText: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 12,
    color: Colors.red,
    letterSpacing: 2,
  },
  fallbackSub: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 9,
    color: Colors.textDim,
    marginTop: 4,
  },

  // HUD overlays
  hudTL: { position: 'absolute', top: 10, left: 10, zIndex: 4 },
  hudTR: { position: 'absolute', top: 10, right: 10, zIndex: 4, alignItems: 'flex-end' },
  hudBL: { position: 'absolute', bottom: 10, left: 10, zIndex: 4 },
  hudBR: { position: 'absolute', bottom: 10, right: 10, zIndex: 4, alignItems: 'flex-end' },
  hudVal: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 12,
    color: 'rgba(255,51,51,0.7)',
    letterSpacing: 1,
  },
  hudLbl: {
    fontFamily: 'Orbitron_400Regular',
    fontSize: 7,
    color: 'rgba(255,255,255,0.3)',
    letterSpacing: 1,
  },

  // Controls column
  controlsCol: {
    width: '44%' as any,
    maxWidth: 380,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255,51,51,0.12)',
  },
  controls: {
    padding: 12,
    gap: 10,
  },
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
  allDestroyedText: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 11,
    color: Colors.green,
    textAlign: 'center',
    letterSpacing: 1,
    paddingVertical: 12,
  },

  // Target rows
  targetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.bgCard3,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  targetRowSelected: {
    borderColor: Colors.red,
    backgroundColor: 'rgba(255,51,51,0.06)',
  },
  targetDot: { width: 10, height: 10, borderRadius: 5 },
  targetName: {
    flex: 1,
    fontFamily: 'Orbitron_400Regular',
    fontSize: 10,
    letterSpacing: 1,
  },
  targetBearing: {
    fontFamily: 'Orbitron_400Regular',
    fontSize: 10,
    color: Colors.amber,
    minWidth: 45,
    textAlign: 'right',
  },
  targetRange: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 10,
    minWidth: 40,
    textAlign: 'right',
  },
  targetHitPct: {
    fontFamily: 'Orbitron_400Regular',
    fontSize: 10,
    minWidth: 38,
    textAlign: 'right',
  },
  lockIcon: { fontSize: 14, marginLeft: 4 },

  // Torpedoes
  torpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  torpTubes: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  torpTube: {
    width: 24,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bgCard3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  torpTubeLoaded: {
    borderColor: Colors.orange,
    backgroundColor: 'rgba(255,102,0,0.12)',
  },
  torpTubeInner: {
    width: 8,
    height: 28,
    borderRadius: 4,
    backgroundColor: Colors.orange,
  },
  torpCounts: { marginLeft: 8 },
  torpCountVal: {
    fontFamily: 'Orbitron_900Black',
    fontSize: 20,
    color: Colors.orange,
  },
  torpCountLbl: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 9,
    color: '#444',
    letterSpacing: 1,
  },
  torpReserveLbl: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 9,
    color: '#444',
    letterSpacing: 1,
  },

  // Fire
  fireBtn: {
    paddingVertical: 16,
    backgroundColor: 'rgba(255,51,51,0.08)',
    borderWidth: 2,
    borderColor: Colors.red,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fireBtnDisabled: { opacity: 0.25 },
  fireBtnLabel: {
    fontFamily: 'Orbitron_900Black',
    fontSize: 14,
    color: Colors.red,
    letterSpacing: 3,
  },
  lockInfo: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 9,
    color: 'rgba(255,179,0,0.4)',
    textAlign: 'center',
    letterSpacing: 1,
  },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 12,
    color: Colors.textDim,
  },
});
