import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
} from 'react-native';
import { useGame } from '@/contexts/GameContext';
import { Colors } from '@/constants/Colors';
import { playSound } from '@/utils/sounds';
import * as Haptics from 'expo-haptics';
import { MissionTaskCard } from '@/components/game/MissionTaskCard';

export function EngineerStation() {
  const { gameState, repairHull, rearmTorps, setCooling } = useGame();
  const [repairing, setRepairing] = useState(false);
  const [rearming, setRearming] = useState(false);
  const [localCooling, setLocalCooling] = useState(gameState?.coolingRods ?? 50);

  const gs = gameState;

  if (!gs) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Awaiting game state...</Text>
      </View>
    );
  }

  const reactorTemp = gs.reactorTemp;
  const tempPct = Math.max(0, Math.min(100, ((reactorTemp - 180) / (500 - 180)) * 100));
  const tempColor =
    reactorTemp >= 450 ? Colors.red : reactorTemp >= 380 ? Colors.amber : Colors.green;

  const hullColor = gs.hull > 60 ? Colors.green : gs.hull > 30 ? Colors.amber : Colors.red;

  const handleRepair = () => {
    if (repairing || gs.hull >= 100) return;
    setRepairing(true);
    playSound('buttonPress');
    repairHull();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setTimeout(() => setRepairing(false), 3500);
  };

  const handleRearm = () => {
    if (rearming || gs.torpReserve <= 0) return;
    setRearming(true);
    rearmTorps();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setTimeout(() => setRearming(false), 2000);
  };

  const handleCoolingChange = (newVal: number) => {
    const clamped = Math.max(0, Math.min(100, newVal));
    setLocalCooling(clamped);
    setCooling(clamped);
    playSound('click');
    Haptics.selectionAsync();
  };

  const COOLING_PRESETS = [0, 20, 40, 60, 75, 95, 100];

  return (
    <View style={styles.root}>
      <View style={styles.leftPanel}>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>REACTOR STATUS</Text>
          <View style={styles.reactorMain}>
            <View style={styles.tempGauge}>
              <View style={styles.tempBarWrap}>
                <View
                  style={[
                    styles.tempBarFill,
                    { height: `${tempPct}%` as any, backgroundColor: tempColor },
                  ]}
                />
              </View>
            </View>
            <View style={styles.reactorInfo}>
              <Text style={[styles.tempVal, { color: tempColor }]}>
                {Math.round(reactorTemp)}°
              </Text>
              <Text style={styles.tempLbl}>CORE TEMP</Text>
              <View style={[styles.tempBadge, { borderColor: tempColor + '44', backgroundColor: tempColor + '11' }]}>
                <Text style={[styles.tempBadgeText, { color: tempColor }]}>
                  {reactorTemp >= 450 ? '⚠ CRITICAL' : reactorTemp >= 380 ? '● ELEVATED' : '● NOMINAL'}
                </Text>
              </View>

              <View style={{ marginTop: 12 }}>
                <Text style={styles.smallLabel}>POWER OUTPUT</Text>
                <View style={styles.smallBar}>
                  <View
                    style={[
                      styles.smallBarFill,
                      { width: `${gs.power}%` as any, backgroundColor: Colors.blue },
                    ]}
                  />
                </View>
                <Text style={styles.smallBarVal}>{gs.power}%</Text>
              </View>
            </View>
          </View>

          <View style={{ marginTop: 12 }}>
            <Text style={styles.cardLabel}>COOLING RODS — {localCooling}%</Text>
            <View style={styles.coolingPresets}>
              {COOLING_PRESETS.map((p) => {
                const active = localCooling === p;
                const c = p >= 75 ? Colors.teal : p >= 40 ? Colors.green : Colors.textDim;
                return (
                  <TouchableOpacity
                    key={p}
                    style={[
                      styles.coolBtn,
                      { borderColor: active ? c : c + '30' },
                      active && { backgroundColor: c + '15' },
                    ]}
                    onPress={() => handleCoolingChange(p)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.coolBtnText, { color: active ? c : Colors.textDim }]}>
                      {p}%
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </View>

      <View style={styles.rightPanel}>
        <MissionTaskCard />
        <View style={styles.card}>
          <Text style={styles.cardLabel}>HULL INTEGRITY — {Math.round(gs.hull)}%</Text>
          <View style={styles.hullBarWrap}>
            <View
              style={[
                styles.hullBarFill,
                { width: `${gs.hull}%` as any, backgroundColor: hullColor },
              ]}
            />
          </View>
          <View style={styles.hullDetails}>
            <View style={styles.hullStat}>
              <Text style={[styles.hullVal, { color: hullColor }]}>{Math.round(gs.hull)}%</Text>
              <Text style={styles.hullStatLbl}>INTEGRITY</Text>
            </View>
            <View style={styles.hullStat}>
              <Text style={styles.hullVal}>
                {gs.hull >= 70 ? 'GOOD' : gs.hull >= 40 ? 'DAMAGED' : 'CRITICAL'}
              </Text>
              <Text style={styles.hullStatLbl}>STATUS</Text>
            </View>
          </View>
          <TouchableOpacity
            style={[
              styles.repairBtn,
              (repairing || gs.hull >= 100) && styles.btnDisabled,
            ]}
            onPress={handleRepair}
            disabled={repairing || gs.hull >= 100}
            activeOpacity={0.8}
          >
            <Text style={styles.repairBtnText}>
              {repairing ? '⚙ REPAIRING...' : '⚙  EMERGENCY REPAIR (+15%)'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>WEAPONS LOADOUT</Text>
          <View style={styles.torpRow}>
            <View style={styles.torpStat}>
              <Text style={styles.torpVal}>{gs.torps}</Text>
              <Text style={styles.torpLbl}>LOADED</Text>
            </View>
            <View style={styles.torpDivider} />
            <View style={styles.torpStat}>
              <Text style={styles.torpVal}>{gs.torpReserve}</Text>
              <Text style={styles.torpLbl}>RESERVE</Text>
            </View>
          </View>

          <View style={styles.torpTubes}>
            {Array.from({ length: 6 }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.torpTube,
                  i < gs.torps && styles.torpTubeLoaded,
                ]}
              >
                <Text style={styles.torpTubeLabel}>{i + 1}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={[
              styles.rearmBtn,
              (rearming || gs.torpReserve <= 0 || gs.torps >= 6) && styles.btnDisabled,
            ]}
            onPress={handleRearm}
            disabled={rearming || gs.torpReserve <= 0 || gs.torps >= 6}
            activeOpacity={0.8}
          >
            <Text style={styles.rearmBtnText}>
              {rearming ? '⚙ REARMING...' : '⚙  RELOAD TORPEDOES'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>SHIP SYSTEMS</Text>
          {gs.systems.map((sys) => {
            const statusColor =
              sys.status === 'ONLINE'
                ? Colors.green
                : sys.status === 'DEGRADED'
                ? Colors.amber
                : Colors.red;
            return (
              <View key={sys.id} style={styles.sysRow}>
                <View
                  style={[styles.sysDot, { backgroundColor: statusColor }]}
                />
                <Text style={styles.sysName}>{sys.name}</Text>
                <Text style={[styles.sysStatus, { color: statusColor }]}>
                  {sys.status}
                </Text>
              </View>
            );
          })}
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
  reactorMain: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'flex-end',
  },
  tempGauge: {
    width: 28,
    height: 120,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  tempBarWrap: {
    width: '100%',
    height: '100%',
    justifyContent: 'flex-end',
  },
  tempBarFill: {
    width: '100%',
    borderRadius: 2,
  },
  reactorInfo: {
    flex: 1,
    alignItems: 'flex-start',
  },
  tempVal: {
    fontFamily: 'Orbitron_900Black',
    fontSize: 28,
    letterSpacing: 1,
  },
  tempLbl: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 8,
    color: Colors.textDim,
    letterSpacing: 2,
    marginBottom: 8,
  },
  tempBadge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  tempBadgeText: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 8,
    letterSpacing: 1,
  },
  smallLabel: {
    fontFamily: 'Orbitron_400Regular',
    fontSize: 7,
    color: Colors.textDim,
    letterSpacing: 2,
    marginBottom: 6,
  },
  smallBar: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 4,
  },
  smallBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  smallBarVal: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 9,
    color: Colors.blue,
    letterSpacing: 1,
  },
  coolingPresets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  coolBtn: {
    flex: 1,
    minWidth: '25%',
    borderWidth: 1,
    borderRadius: 6,
    padding: 8,
    alignItems: 'center',
  },
  coolBtnText: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 9,
    letterSpacing: 1,
  },
  hullBarWrap: {
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 12,
  },
  hullBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  hullDetails: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  hullStat: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 6,
    padding: 10,
    alignItems: 'center',
  },
  hullVal: {
    fontFamily: 'Orbitron_900Black',
    fontSize: 16,
    color: Colors.amber,
    letterSpacing: 1,
  },
  hullStatLbl: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 8,
    color: Colors.textDim,
    letterSpacing: 1,
    marginTop: 3,
  },
  repairBtn: {
    backgroundColor: 'rgba(0,255,136,0.08)',
    borderWidth: 1,
    borderColor: Colors.green,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  repairBtnText: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 10,
    color: Colors.green,
    letterSpacing: 1,
  },
  torpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  torpStat: {
    flex: 1,
    alignItems: 'center',
  },
  torpVal: {
    fontFamily: 'Orbitron_900Black',
    fontSize: 28,
    color: Colors.orange,
  },
  torpLbl: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 8,
    color: Colors.textDim,
    letterSpacing: 1,
    marginTop: 2,
  },
  torpDivider: {
    width: 1,
    height: 40,
    backgroundColor: Colors.border,
  },
  torpTubes: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  torpTube: {
    flex: 1,
    height: 24,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,140,0,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  torpTubeLoaded: {
    backgroundColor: 'rgba(255,140,0,0.18)',
    borderColor: Colors.orange,
  },
  torpTubeLabel: {
    fontFamily: 'Orbitron_400Regular',
    fontSize: 7,
    color: Colors.textDim,
  },
  rearmBtn: {
    backgroundColor: 'rgba(255,140,0,0.08)',
    borderWidth: 1,
    borderColor: Colors.orange,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  rearmBtnText: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 10,
    color: Colors.orange,
    letterSpacing: 1,
  },
  btnDisabled: {
    opacity: 0.3,
  },
  sysRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.03)',
  },
  sysDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sysName: {
    fontFamily: 'Orbitron_400Regular',
    fontSize: 9,
    color: Colors.text,
    flex: 1,
    letterSpacing: 1,
  },
  sysStatus: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 8,
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
