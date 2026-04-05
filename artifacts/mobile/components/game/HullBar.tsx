import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useGame } from '@/contexts/GameContext';
import { Colors } from '@/constants/Colors';

export function HullBar() {
  const { gameState } = useGame();

  const hull = gameState?.hull ?? 100;
  const heading = gameState?.heading ?? 0;
  const depth = gameState?.depth ?? 142;
  const speed = gameState?.speed ?? 'STOP';
  const torps = gameState?.torps ?? 0;
  const torpReserve = gameState?.torpReserve ?? 0;
  const reactorTemp = gameState?.reactorTemp ?? 280;

  const hullColor = hull > 60 ? Colors.green : hull > 30 ? Colors.amber : Colors.red;

  const hdg = Math.round(heading);
  const hdgStr = `${hdg < 10 ? '00' : hdg < 100 ? '0' : ''}${hdg}°`;

  const tempColor =
    reactorTemp >= 450
      ? Colors.red
      : reactorTemp >= 380
      ? Colors.amber
      : Colors.green;

  return (
    <View style={styles.container}>
      <View style={styles.stat}>
        <Text style={[styles.val, { color: hullColor }]}>{Math.round(hull)}%</Text>
        <Text style={styles.lbl}>HULL</Text>
      </View>
      <View style={styles.barWrap}>
        <View style={[styles.barFill, { width: `${hull}%` as any, backgroundColor: hullColor }]} />
      </View>
      <View style={styles.divider} />
      <View style={styles.stat}>
        <Text style={styles.val}>{hdgStr}</Text>
        <Text style={styles.lbl}>HDG</Text>
      </View>
      <View style={styles.divider} />
      <View style={styles.stat}>
        <Text style={styles.val}>{depth}m</Text>
        <Text style={styles.lbl}>DEPTH</Text>
      </View>
      <View style={styles.divider} />
      <View style={styles.stat}>
        <Text style={styles.val}>{speed}</Text>
        <Text style={styles.lbl}>SPD</Text>
      </View>
      <View style={styles.divider} />
      <View style={styles.stat}>
        <Text style={[styles.val, { color: Colors.orange }]}>
          {torps}+{torpReserve}
        </Text>
        <Text style={styles.lbl}>TORPS</Text>
      </View>
      <View style={styles.divider} />
      <View style={styles.stat}>
        <Text style={[styles.val, { color: tempColor }]}>{Math.round(reactorTemp)}°</Text>
        <Text style={styles.lbl}>REACTOR</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 6,
  },
  stat: {
    alignItems: 'center',
    minWidth: 36,
  },
  val: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 10,
    color: Colors.amber,
    letterSpacing: 0.5,
  },
  lbl: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 7,
    color: Colors.textDim,
    letterSpacing: 0.5,
  },
  barWrap: {
    flex: 1,
    height: 5,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
  divider: {
    width: 1,
    height: 20,
    backgroundColor: Colors.border,
  },
});
