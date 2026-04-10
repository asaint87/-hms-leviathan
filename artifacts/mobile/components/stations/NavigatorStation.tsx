import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  PanResponder,
  Dimensions,
} from 'react-native';
import { useGame } from '@/contexts/GameContext';
import { Speed, bearingLabel } from '@workspace/world';
import { Colors } from '@/constants/Colors';
import * as Haptics from 'expo-haptics';
import { MissionTaskCard } from '@/components/game/MissionTaskCard';

// Speed UI surface — currently only the 4 ahead speeds are buttons.
// FLANK and REVERSE exist in the world type but aren't in the dial yet;
// they'll appear when missions need them.
const SPEEDS: Speed[] = ['STOP', '1/3', '2/3', 'FULL'];
const SPEED_COLORS: Record<Speed, string> = {
  STOP: Colors.textDim,
  '1/3': Colors.green,
  '2/3': Colors.amber,
  FULL: Colors.red,
  FLANK: Colors.red,
  REVERSE: Colors.textDim,
};

const DEPTH_PRESETS = [18, 50, 100, 150, 200, 250, 300];

export function NavigatorStation() {
  const { world, setHeading, setDepth, setSpeed } = useGame();
  const sub = world?.submarine;
  const [localHeading, setLocalHeading] = useState(sub?.heading ?? 0);
  const draggingRef = useRef(false);
  const dialRef = useRef<View>(null);
  const centerRef = useRef({ x: 0, y: 0 });

  if (!sub || !world) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Awaiting game state...</Text>
      </View>
    );
  }

  const dialPan = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt) => {
      draggingRef.current = true;
    },
    onPanResponderMove: (evt, gs2) => {
      const { moveX, moveY } = evt.nativeEvent;
      const cx = centerRef.current.x;
      const cy = centerRef.current.y;
      const dx = moveX - cx;
      const dy = moveY - cy;
      const angle = (Math.atan2(dx, -dy) * 180) / Math.PI;
      const clamped = ((Math.round(angle) % 360) + 360) % 360;
      setLocalHeading(clamped);
    },
    onPanResponderRelease: () => {
      draggingRef.current = false;
      setHeading(localHeading);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
  });

  const DIAL_SIZE = 180;
  const hdg = localHeading;
  const tickAngles = Array.from({ length: 36 }, (_, i) => i * 10);
  const cardinals = ['N', 'E', 'S', 'W'];
  const cardinalAngles = [0, 90, 180, 270];

  return (
    <View style={styles.root}>
      <View style={styles.leftPanel}>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>HEADING CONTROL</Text>
          <View style={styles.dialWrap}>
            <View
              ref={dialRef}
              onLayout={(e) => {
                dialRef.current?.measure((x, y, w, h, pageX, pageY) => {
                  centerRef.current = { x: pageX + w / 2, y: pageY + h / 2 };
                });
              }}
              style={[styles.dial, { width: DIAL_SIZE, height: DIAL_SIZE }]}
              {...dialPan.panHandlers}
            >
              {tickAngles.map((a) => {
                const r = (DIAL_SIZE / 2) * 0.88;
                const rad = ((a - hdg) * Math.PI) / 180;
                const len = a % 30 === 0 ? 12 : 6;
                const x = DIAL_SIZE / 2 + r * Math.sin(rad);
                const y = DIAL_SIZE / 2 - r * Math.cos(rad);
                return (
                  <View
                    key={a}
                    style={{
                      position: 'absolute',
                      width: a % 30 === 0 ? 2 : 1,
                      height: len,
                      backgroundColor:
                        a % 30 === 0
                          ? Colors.amber
                          : 'rgba(255,179,0,0.3)',
                      left: x - (a % 30 === 0 ? 1 : 0.5),
                      top: y - len / 2,
                      transform: [{ rotate: `${a - hdg}deg` }],
                    }}
                  />
                );
              })}

              {cardinalAngles.map((a, i) => {
                const r = (DIAL_SIZE / 2) * 0.65;
                const rad = ((a - hdg) * Math.PI) / 180;
                const x = DIAL_SIZE / 2 + r * Math.sin(rad);
                const y = DIAL_SIZE / 2 - r * Math.cos(rad);
                return (
                  <Text
                    key={cardinals[i]}
                    style={{
                      position: 'absolute',
                      fontFamily: 'Orbitron_700Bold',
                      fontSize: 12,
                      color: i === 0 ? Colors.red : Colors.amber,
                      left: x - 8,
                      top: y - 8,
                    }}
                  >
                    {cardinals[i]}
                  </Text>
                );
              })}

              <View style={[styles.dialCenter]}>
                <Text style={styles.dialHdg}>{bearingLabel(hdg)}</Text>
                <Text style={styles.dialLbl}>HEADING</Text>
              </View>
            </View>

            <View style={styles.dialPointer} />
          </View>

          <View style={styles.hdgBtns}>
            {[-45, -10, -5, 5, 10, 45].map((delta) => (
              <TouchableOpacity
                key={delta}
                style={styles.hdgBtn}
                onPress={() => {
                  const next = ((hdg + delta) % 360 + 360) % 360;
                  setLocalHeading(next);
                  setHeading(next);
                  Haptics.selectionAsync();
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.hdgBtnText}>{delta > 0 ? '+' : ''}{delta}°</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      <View style={styles.rightPanel}>
        <MissionTaskCard />
        <View style={styles.card}>
          <Text style={styles.cardLabel}>DEPTH CONTROL — {sub.depth}m</Text>
          <View style={styles.depthGrid}>
            {DEPTH_PRESETS.map((d) => {
              const active = Math.abs(sub.depth - d) < 5;
              return (
                <TouchableOpacity
                  key={d}
                  style={[
                    styles.depthBtn,
                    active && {
                      backgroundColor: 'rgba(0,207,255,0.15)',
                      borderColor: Colors.blue,
                    },
                  ]}
                  onPress={() => {
                    setDepth(d);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.depthBtnText, active && { color: Colors.blue }]}>
                    {d}m
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>ENGINE SPEED — {sub.speed}</Text>
          <View style={styles.speedRow}>
            {SPEEDS.map((s) => {
              const active = sub.speed === s;
              const c = SPEED_COLORS[s];
              return (
                <TouchableOpacity
                  key={s}
                  style={[
                    styles.speedBtn,
                    { borderColor: active ? c : c + '30' },
                    active && { backgroundColor: c + '18' },
                  ]}
                  onPress={() => {
                    setSpeed(s);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.speedBtnText, { color: active ? c : Colors.textDim }]}>
                    {s}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>POSITION</Text>
          <View style={styles.posGrid}>
            <View style={styles.posStat}>
              <Text style={styles.posVal}>{bearingLabel(sub.heading)}</Text>
              <Text style={styles.posLbl}>COURSE</Text>
            </View>
            <View style={styles.posStat}>
              <Text style={styles.posVal}>{sub.depth}m</Text>
              <Text style={styles.posLbl}>DEPTH</Text>
            </View>
            <View style={styles.posStat}>
              <Text style={styles.posVal}>{sub.speed}</Text>
              <Text style={styles.posLbl}>SPEED</Text>
            </View>
            <View style={styles.posStat}>
              <Text style={styles.posVal}>
                {sub.position.x.toFixed(1)} km E · {(-sub.position.y).toFixed(1)} km N
              </Text>
              <Text style={styles.posLbl}>GRID</Text>
            </View>
          </View>
        </View>
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
  dialWrap: {
    alignItems: 'center',
    marginBottom: 12,
  },
  dial: {
    position: 'relative',
    borderRadius: 100,
    backgroundColor: 'rgba(0,10,20,0.9)',
    borderWidth: 2,
    borderColor: 'rgba(255,179,0,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialCenter: {
    alignItems: 'center',
    position: 'absolute',
  },
  dialHdg: {
    fontFamily: 'Orbitron_900Black',
    fontSize: 22,
    color: Colors.amber,
    letterSpacing: 2,
  },
  dialLbl: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 8,
    color: Colors.textDim,
    letterSpacing: 2,
    marginTop: 2,
  },
  dialPointer: {
    position: 'absolute',
    top: -1,
    width: 3,
    height: 12,
    backgroundColor: Colors.red,
    borderRadius: 1,
    alignSelf: 'center',
  },
  hdgBtns: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  hdgBtn: {
    flex: 1,
    minWidth: '28%',
    backgroundColor: 'rgba(255,179,0,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,179,0,0.2)',
    borderRadius: 6,
    padding: 8,
    alignItems: 'center',
  },
  hdgBtnText: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 9,
    color: Colors.amber,
    letterSpacing: 1,
  },
  depthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  depthBtn: {
    flex: 1,
    minWidth: '27%',
    backgroundColor: 'rgba(0,207,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(0,207,255,0.2)',
    borderRadius: 6,
    padding: 10,
    alignItems: 'center',
  },
  depthBtnText: {
    fontFamily: 'Orbitron_400Regular',
    fontSize: 11,
    color: Colors.blue,
    letterSpacing: 1,
  },
  speedRow: {
    flexDirection: 'row',
    gap: 8,
  },
  speedBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  speedBtnText: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 9,
    letterSpacing: 1,
  },
  posGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  posStat: {
    flex: 1,
    minWidth: '40%',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 6,
    padding: 8,
    alignItems: 'center',
  },
  posVal: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 12,
    color: Colors.blue,
    letterSpacing: 1,
  },
  posLbl: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 7,
    color: Colors.textDim,
    letterSpacing: 1,
    marginTop: 3,
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
