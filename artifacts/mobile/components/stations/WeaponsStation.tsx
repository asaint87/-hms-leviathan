import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
} from 'react-native';
import { useGame, Enemy } from '@/contexts/GameContext';
import { Colors } from '@/constants/Colors';
import { bearingRangeToOffset, bearingLabel, rangeKm, hitProbability } from '@/utils/bearingMath';
import { playSound } from '@/utils/sounds';
import * as Haptics from 'expo-haptics';
import { MissionTaskCard } from '@/components/game/MissionTaskCard';

export function WeaponsStation() {
  const { gameState, fireTorpedo } = useGame();
  const [selectedTarget, setSelectedTarget] = useState<number | null>(null);
  const [firing, setFiring] = useState(false);
  const lockAnim = useRef(new Animated.Value(0)).current;

  const gs = gameState;

  useEffect(() => {
    if (selectedTarget !== null) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(lockAnim, { toValue: 1, duration: 400, useNativeDriver: false }),
          Animated.timing(lockAnim, { toValue: 0, duration: 400, useNativeDriver: false }),
        ])
      ).start();
    } else {
      lockAnim.stopAnimation();
      lockAnim.setValue(0);
    }
    return () => lockAnim.stopAnimation();
  }, [selectedTarget]);

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
  const rangePct = target ? Math.round(target.range * 100) : 0;

  const canFire = gs.torps > 0 && selectedTarget !== null && target && !firing;

  const handleFire = () => {
    if (!canFire || !selectedTarget) return;
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

  const lockColor = lockAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(255,48,48,0.4)', 'rgba(255,48,48,1)'],
  });

  return (
    <View style={styles.root}>
      <View style={styles.leftPanel}>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>TORPEDO STATUS</Text>
          <View style={styles.torpRow}>
            {Array.from({ length: 6 }).map((_, i) => (
              <View
                key={i}
                style={[styles.torpTube, i < gs.torps && styles.torpTubeLoaded]}
              >
                <Text style={[styles.torpTubeLbl, i < gs.torps && { color: Colors.orange }]}>
                  {i + 1}
                </Text>
              </View>
            ))}
          </View>
          <View style={styles.torpCountRow}>
            <View style={styles.torpCount}>
              <Text style={styles.torpCountVal}>{gs.torps}</Text>
              <Text style={styles.torpCountLbl}>LOADED</Text>
            </View>
            <View style={styles.torpCount}>
              <Text style={[styles.torpCountVal, { color: Colors.textDim }]}>
                {gs.torpReserve}
              </Text>
              <Text style={styles.torpCountLbl}>RESERVE</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>TARGETS — {liveEnemies.length} ALIVE</Text>
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
      </View>

      <View style={styles.rightPanel}>
        <MissionTaskCard />
        {target ? (
          <View style={styles.fireControl}>
            <Animated.View style={[styles.lockIndicator, { borderColor: lockColor }]}>
              <Text style={styles.lockText}>TARGET LOCK</Text>
              <Text style={[styles.lockTargetName, { color: target.identified ? Colors.red : Colors.amber }]}>
                {target.identified ? target.type : '??? UNKNOWN VESSEL'}
              </Text>

              <View style={styles.targetStats}>
                <View style={styles.targetStat}>
                  <Text style={styles.targetStatVal}>{bearingLabel(target.bearing)}</Text>
                  <Text style={styles.targetStatLbl}>BEARING</Text>
                </View>
                <View style={styles.targetStat}>
                  <Text style={styles.targetStatVal}>{rangeKm(target.range)} km</Text>
                  <Text style={styles.targetStatLbl}>RANGE</Text>
                </View>
                <View style={styles.targetStat}>
                  <Text style={[styles.targetStatVal, {
                    color: hitPct > 70 ? Colors.green : hitPct > 50 ? Colors.amber : Colors.red,
                  }]}>
                    {hitPct}%
                  </Text>
                  <Text style={styles.targetStatLbl}>HIT CHANCE</Text>
                </View>
              </View>

              <View style={styles.hitMeter}>
                <View
                  style={[
                    styles.hitMeterFill,
                    {
                      width: `${hitPct}%` as any,
                      backgroundColor: hitPct > 70 ? Colors.green : hitPct > 50 ? Colors.amber : Colors.red,
                    },
                  ]}
                />
              </View>
            </Animated.View>

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
                  ? '⟳  FIRING...'
                  : '◉  FIRE TORPEDO'}
              </Text>
              {gs.torps > 0 && !firing && (
                <Text style={styles.fireBtnSub}>
                  {hitPct}% hit probability at {rangeKm(target.range)} km
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.deselectBtn}
              onPress={() => setSelectedTarget(null)}
            >
              <Text style={styles.deselectText}>CANCEL LOCK</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.noTargetCard}>
            <View style={styles.noTargetInner}>
              <Text style={styles.noTargetTitle}>NO TARGET SELECTED</Text>
              <Text style={styles.noTargetSub}>
                {detectedEnemies.length > 0
                  ? `${detectedEnemies.length} detected contact${detectedEnemies.length > 1 ? 's' : ''} available\nSelect a target on the left`
                  : 'No contacts detected\nWait for Sonar to find targets'}
              </Text>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

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
  return (
    <TouchableOpacity
      style={[styles.targetRow, selected && styles.targetRowSelected]}
      onPress={onSelect}
      activeOpacity={0.8}
    >
      <View style={styles.targetRowLeft}>
        <View
          style={[
            styles.targetDot,
            {
              backgroundColor: enemy.identified ? Colors.red : Colors.amber,
              opacity: enemy.detected ? 1 : 0.4,
            },
          ]}
        />
        <View>
          <Text
            style={[
              styles.targetName,
              { color: enemy.detected ? (enemy.identified ? Colors.red : Colors.amber) : Colors.textDim },
            ]}
          >
            {enemy.identified ? enemy.type : enemy.detected ? '??? CONTACT' : '○ UNDETECTED'}
          </Text>
          <Text style={styles.targetBearing}>
            BRG {bearingLabel(enemy.bearing)} · {rangeKm(enemy.range)} km · {hitPct}% HIT
          </Text>
        </View>
      </View>
      {selected && (
        <View style={styles.lockedBadge}>
          <Text style={styles.lockedBadgeText}>LOCKED</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
  },
  leftPanel: {
    width: 240,
    padding: 10,
    borderRightWidth: 1,
    borderRightColor: Colors.border,
    gap: 10,
  },
  rightPanel: {
    flex: 1,
    padding: 10,
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
    marginBottom: 12,
  },
  torpRow: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 10,
  },
  torpTube: {
    flex: 1,
    height: 30,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,140,0,0.2)',
    backgroundColor: 'rgba(255,255,255,0.02)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  torpTubeLoaded: {
    backgroundColor: 'rgba(255,140,0,0.15)',
    borderColor: Colors.orange,
  },
  torpTubeLbl: {
    fontFamily: 'Orbitron_400Regular',
    fontSize: 8,
    color: 'rgba(255,140,0,0.3)',
  },
  torpCountRow: {
    flexDirection: 'row',
    gap: 12,
  },
  torpCount: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 6,
    padding: 8,
  },
  torpCountVal: {
    fontFamily: 'Orbitron_900Black',
    fontSize: 24,
    color: Colors.orange,
  },
  torpCountLbl: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 7,
    color: Colors.textDim,
    letterSpacing: 1,
    marginTop: 2,
  },
  allDestroyedText: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 11,
    color: Colors.green,
    textAlign: 'center',
    letterSpacing: 1,
    paddingVertical: 12,
  },
  targetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
    gap: 10,
  },
  targetRowSelected: {
    backgroundColor: 'rgba(255,48,48,0.06)',
  },
  targetRowLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  targetDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  targetName: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 9,
    letterSpacing: 1,
  },
  targetBearing: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 8,
    color: Colors.textDim,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  lockedBadge: {
    backgroundColor: 'rgba(255,48,48,0.1)',
    borderWidth: 1,
    borderColor: Colors.red,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  lockedBadgeText: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 7,
    color: Colors.red,
    letterSpacing: 1,
  },
  fireControl: {
    flex: 1,
    gap: 12,
  },
  lockIndicator: {
    flex: 1,
    backgroundColor: 'rgba(255,48,48,0.05)',
    borderWidth: 2,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  lockText: {
    fontFamily: 'Orbitron_400Regular',
    fontSize: 9,
    color: Colors.red,
    letterSpacing: 4,
  },
  lockTargetName: {
    fontFamily: 'Orbitron_900Black',
    fontSize: 16,
    letterSpacing: 2,
    textAlign: 'center',
  },
  targetStats: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 8,
  },
  targetStat: {
    alignItems: 'center',
  },
  targetStatVal: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 14,
    color: Colors.amber,
  },
  targetStatLbl: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 7,
    color: Colors.textDim,
    letterSpacing: 1,
    marginTop: 3,
  },
  hitMeter: {
    width: '80%',
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 8,
  },
  hitMeterFill: {
    height: '100%',
    borderRadius: 2,
  },
  fireBtn: {
    backgroundColor: 'rgba(255,48,48,0.12)',
    borderWidth: 2,
    borderColor: Colors.red,
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    gap: 4,
  },
  fireBtnDisabled: {
    opacity: 0.3,
  },
  fireBtnLabel: {
    fontFamily: 'Orbitron_900Black',
    fontSize: 16,
    color: Colors.red,
    letterSpacing: 3,
  },
  fireBtnSub: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 9,
    color: 'rgba(255,48,48,0.6)',
    letterSpacing: 1,
  },
  deselectBtn: {
    alignItems: 'center',
    padding: 10,
  },
  deselectText: {
    fontFamily: 'Orbitron_400Regular',
    fontSize: 9,
    color: Colors.textDim,
    letterSpacing: 2,
  },
  noTargetCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noTargetInner: {
    alignItems: 'center',
    gap: 10,
  },
  noTargetTitle: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 14,
    color: Colors.textDim,
    letterSpacing: 2,
  },
  noTargetSub: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 10,
    color: Colors.textDim + '80',
    textAlign: 'center',
    lineHeight: 16,
    letterSpacing: 1,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 12,
    color: Colors.textDim,
  },
});
