import React, { useRef, useEffect, useState } from 'react';
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
import { bearingRangeToOffset, bearingLabel, rangeKm } from '@/utils/bearingMath';
import { playSound } from '@/utils/sounds';
import * as Haptics from 'expo-haptics';
import { MissionTaskCard } from '@/components/game/MissionTaskCard';

const SCOPE_SIZE = 200;
const CENTER = SCOPE_SIZE / 2;

export function SonarStation() {
  const { gameState, sonarPing } = useGame();
  const sweepAnim = useRef(new Animated.Value(0)).current;
  const [sweepRunning, setSweepRunning] = useState(false);

  const gs = gameState;

  function doSweep() {
    if (sweepRunning) return;
    setSweepRunning(true);
    sweepAnim.setValue(0);
    sonarPing();
    playSound('sonarPing');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Animated.timing(sweepAnim, {
      toValue: 1,
      duration: 2200,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start(() => setSweepRunning(false));
  }

  if (!gs) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Awaiting game state...</Text>
      </View>
    );
  }

  const contacts = gs.enemies.filter((e) => e.detected && !e.destroyed);
  const undetected = gs.enemies.filter((e) => !e.detected && !e.destroyed);

  return (
    <View style={styles.root}>
      <View style={styles.leftPanel}>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>PASSIVE SONAR ARRAY</Text>
          <View style={styles.scopeWrap}>
            <SonarScope enemies={contacts} sweepAnim={sweepAnim} heading={gs.heading} />
          </View>

          <TouchableOpacity
            style={[styles.pingBtn, sweepRunning && styles.pingBtnActive]}
            onPress={doSweep}
            disabled={sweepRunning}
            activeOpacity={0.8}
          >
            <Text style={styles.pingBtnText}>
              {sweepRunning ? 'PINGING...' : '◉  ACTIVE PING'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.rightPanel}>
        <MissionTaskCard />
        <View style={styles.card}>
          <Text style={styles.cardLabel}>CONTACTS — {contacts.length} DETECTED</Text>

          {contacts.length === 0 && (
            <View style={styles.noContactWrap}>
              <Text style={styles.noContactText}>NO CONTACTS ON PASSIVE SONAR</Text>
              <Text style={styles.noContactSub}>Use ACTIVE PING to search</Text>
            </View>
          )}

          {contacts.map((enemy) => (
            <ContactRow key={enemy.id} enemy={enemy} />
          ))}

          {undetected.length > 0 && (
            <View style={styles.undetectedNote}>
              <Text style={styles.undetectedText}>
                {undetected.length} undetected contact{undetected.length > 1 ? 's' : ''} — ping to reveal
              </Text>
            </View>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>NOISE LEVELS</Text>
          <View style={styles.noiseGrid}>
            {['BAFFLES', 'BOW', 'PORT', 'STBD'].map((d, i) => {
              const val = 20 + Math.floor(Math.sin(Date.now() / 3000 + i) * 15 + Math.random() * 10);
              const pct = Math.min(100, Math.max(0, val));
              return (
                <View key={d} style={styles.noiseRow}>
                  <Text style={styles.noiseDir}>{d}</Text>
                  <View style={styles.noiseBar}>
                    <View
                      style={[
                        styles.noiseFill,
                        {
                          width: `${pct}%` as any,
                          backgroundColor: pct > 70 ? Colors.red : pct > 45 ? Colors.amber : Colors.green,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.noiseVal}>{pct} dB</Text>
                </View>
              );
            })}
          </View>
        </View>
      </View>
    </View>
  );
}

function SonarScope({
  enemies,
  sweepAnim,
  heading,
}: {
  enemies: Enemy[];
  sweepAnim: Animated.Value;
  heading: number;
}) {
  const sweepDeg = sweepAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const rings = [0.25, 0.5, 0.75, 1.0];

  return (
    <View style={[styles.scope, { width: SCOPE_SIZE, height: SCOPE_SIZE }]}>
      {rings.map((r, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            width: SCOPE_SIZE * r,
            height: SCOPE_SIZE * r,
            borderRadius: (SCOPE_SIZE * r) / 2,
            left: CENTER - (SCOPE_SIZE * r) / 2,
            top: CENTER - (SCOPE_SIZE * r) / 2,
            borderWidth: 1,
            borderColor: 'rgba(0,255,136,0.12)',
          }}
        />
      ))}

      <View style={[styles.crossH, { top: CENTER - 0.5 }]} />
      <View style={[styles.crossV, { left: CENTER - 0.5 }]} />

      <Animated.View
        style={[
          styles.sweep,
          { transform: [{ rotate: sweepDeg }] },
        ]}
      />

      {enemies.map((enemy) => {
        const pos = bearingRangeToOffset(enemy.bearing - heading, enemy.range * (CENTER - 8));
        const size = 8 + (enemy.strength || 0) * 6;
        return (
          <View
            key={enemy.id}
            style={{
              position: 'absolute',
              width: size,
              height: size,
              borderRadius: size / 2,
              left: CENTER + pos.x - size / 2,
              top: CENTER + pos.y - size / 2,
              backgroundColor: enemy.identified ? Colors.red : Colors.teal,
              opacity: 0.5 + (enemy.strength || 0) * 0.5,
              shadowColor: enemy.identified ? Colors.red : Colors.teal,
              shadowRadius: 8,
              shadowOpacity: 0.9,
            }}
          />
        );
      })}

      <View style={[styles.ownShip, { left: CENTER - 4, top: CENTER - 4 }]} />

      {['N', 'E', 'S', 'W'].map((dir, i) => {
        const a = ((i * 90 - heading + 360) % 360) * (Math.PI / 180);
        const r = CENTER * 0.88;
        return (
          <Text
            key={dir}
            style={{
              position: 'absolute',
              fontFamily: 'Orbitron_400Regular',
              fontSize: 8,
              color: dir === 'N' ? Colors.red : 'rgba(0,255,136,0.4)',
              left: CENTER + Math.sin(a) * r - 5,
              top: CENTER - Math.cos(a) * r - 6,
            }}
          >
            {dir}
          </Text>
        );
      })}
    </View>
  );
}

function ContactRow({ enemy }: { enemy: Enemy }) {
  return (
    <View style={styles.contactRow}>
      <View style={styles.contactLeft}>
        <View
          style={[
            styles.contactDot,
            { backgroundColor: enemy.identified ? Colors.red : Colors.teal },
          ]}
        />
        <View>
          <Text style={styles.contactType}>
            {enemy.identified ? enemy.type : '??? UNKNOWN VESSEL'}
          </Text>
          <Text style={styles.contactBearing}>
            BRG {bearingLabel(enemy.bearing)} · RNG {rangeKm(enemy.range)} km
          </Text>
        </View>
      </View>
      <View style={styles.contactRight}>
        <View style={styles.strengthBar}>
          <View
            style={[
              styles.strengthFill,
              {
                width: `${(enemy.strength || 0) * 100}%` as any,
                backgroundColor: enemy.identified ? Colors.red : Colors.teal,
              },
            ]}
          />
        </View>
        <Text style={styles.strengthLabel}>
          {Math.round((enemy.strength || 0) * 100)}% SIG
        </Text>
      </View>
    </View>
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
  },
  rightPanel: {
    flex: 1,
    padding: 10,
    gap: 10,
  },
  card: {
    backgroundColor: Colors.bgCard2,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  cardLabel: {
    fontFamily: 'Orbitron_400Regular',
    fontSize: 7,
    color: Colors.textDim,
    letterSpacing: 2,
    marginBottom: 12,
  },
  scopeWrap: {
    alignItems: 'center',
    marginBottom: 12,
  },
  scope: {
    backgroundColor: 'rgba(0,15,8,0.95)',
    borderRadius: 100,
    overflow: 'hidden',
    position: 'relative',
  },
  crossH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(0,255,136,0.1)',
  },
  crossV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(0,255,136,0.1)',
  },
  sweep: {
    position: 'absolute',
    width: SCOPE_SIZE,
    height: SCOPE_SIZE / 2,
    transformOrigin: `${CENTER}px ${SCOPE_SIZE}px`,
    top: 0,
    left: 0,
    backgroundColor: 'transparent',
    borderTopLeftRadius: SCOPE_SIZE,
    borderTopRightRadius: SCOPE_SIZE,
    borderWidth: 0,
    overflow: 'hidden',
    opacity: 0.15,
    backgroundImage: 'none',
  },
  ownShip: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 1,
    backgroundColor: Colors.teal,
    shadowColor: Colors.teal,
    shadowRadius: 4,
    shadowOpacity: 1,
  },
  pingBtn: {
    backgroundColor: 'rgba(0,224,255,0.08)',
    borderWidth: 1.5,
    borderColor: Colors.teal,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  pingBtnActive: {
    opacity: 0.5,
  },
  pingBtnText: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 11,
    color: Colors.teal,
    letterSpacing: 2,
  },
  noContactWrap: {
    alignItems: 'center',
    paddingVertical: 16,
    gap: 6,
  },
  noContactText: {
    fontFamily: 'Orbitron_400Regular',
    fontSize: 10,
    color: Colors.textDim,
    letterSpacing: 1,
  },
  noContactSub: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 9,
    color: Colors.textDim + '80',
    letterSpacing: 1,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
    gap: 10,
  },
  contactLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  contactDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    shadowRadius: 6,
    shadowOpacity: 0.9,
  },
  contactType: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 10,
    color: Colors.teal,
    letterSpacing: 1,
  },
  contactBearing: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 9,
    color: Colors.textDim,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  contactRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  strengthBar: {
    width: 60,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  strengthFill: {
    height: '100%',
    borderRadius: 2,
  },
  strengthLabel: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 8,
    color: Colors.textDim,
    letterSpacing: 1,
  },
  undetectedNote: {
    marginTop: 10,
    padding: 10,
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
  noiseGrid: {
    gap: 8,
  },
  noiseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  noiseDir: {
    fontFamily: 'Orbitron_400Regular',
    fontSize: 8,
    color: Colors.textDim,
    width: 40,
    letterSpacing: 1,
  },
  noiseBar: {
    flex: 1,
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  noiseFill: {
    height: '100%',
    borderRadius: 3,
  },
  noiseVal: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 8,
    color: Colors.textDim,
    width: 38,
    textAlign: 'right',
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
