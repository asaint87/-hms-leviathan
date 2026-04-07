import React, { useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  PanResponder,
  Image,
} from 'react-native';
import { useGame } from '@/contexts/GameContext';
import { Colors } from '@/constants/Colors';
import { bearingRangeToOffset, bearingLabel, rangeKm } from '@/utils/bearingMath';
import { ActionLog } from '@/components/game/ActionLog';
import { MissionTaskCard } from '@/components/game/MissionTaskCard';

const RING_COUNT = 4;

export function CaptainStation() {
  const { gameState, players, actionLog } = useGame();

  const gs = gameState;
  if (!gs) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Awaiting game state...</Text>
      </View>
    );
  }

  const enemies = gs.enemies.filter((e) => e.detected && !e.destroyed);
  const destroyed = gs.enemies.filter((e) => e.destroyed);
  const remaining = gs.enemies.filter((e) => !e.destroyed);

  return (
    <View style={styles.root}>
      <View style={styles.leftPanel}>
        <View style={styles.radarWrap}>
          <RadarScope enemies={enemies} heading={gs.heading} />
        </View>

        <View style={styles.missionCard}>
          <Text style={styles.cardLabel}>TACTICAL SITUATION</Text>
          <View style={styles.tactRow}>
            <View style={styles.tactStat}>
              <Text style={styles.tactVal}>{remaining.length}</Text>
              <Text style={styles.tactLbl}>CONTACTS</Text>
            </View>
            <View style={styles.tactStat}>
              <Text style={[styles.tactVal, { color: Colors.green }]}>{destroyed.length}</Text>
              <Text style={styles.tactLbl}>DESTROYED</Text>
            </View>
            <View style={styles.tactStat}>
              <Text style={[styles.tactVal, { color: Colors.orange }]}>
                {gs.torps}
              </Text>
              <Text style={styles.tactLbl}>TORPEDOES</Text>
            </View>
          </View>

          <Text style={[styles.cardLabel, { marginTop: 12 }]}>CREW STATUS</Text>
          {players.map((p, i) => {
            const c = Colors.roles[p.role as keyof typeof Colors.roles] || Colors.roles.c;
            return (
              <View key={i} style={styles.crewRow}>
                {p.avatar ? (
                  <Image source={{ uri: p.avatar }} style={[styles.crewAvatar, { borderColor: c.primary }]} />
                ) : (
                  <View style={[styles.crewDot, { backgroundColor: c.primary }]} />
                )}
                <Text style={[styles.crewName, { color: c.primary }]}>{p.name}</Text>
                <Text style={styles.crewRole}>{p.role.toUpperCase()}</Text>
                <View style={styles.crewOnline}>
                  <Text style={styles.crewOnlineText}>ONLINE</Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.rightPanel}>
        <MissionTaskCard />
        <View style={styles.actionLogCard}>
          <Text style={styles.cardLabel}>BATTLE LOG</Text>
          <ActionLog entries={actionLog} />
        </View>
      </View>
    </View>
  );
}

function RadarScope({
  enemies,
  heading,
}: {
  enemies: ReturnType<typeof useGame>['gameState'] extends infer G
    ? G extends object
      ? any[]
      : never
    : never;
  heading: number;
}) {
  const size = 200;
  const center = size / 2;
  const sweepAngle = useRef(0);
  const frameId = useRef<number>(0);
  const canvasRef = useRef<any>(null);

  return (
    <View style={[styles.radar, { width: size, height: size }]}>
      {Array.from({ length: RING_COUNT }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.radarRing,
            {
              width: (size * (i + 1)) / RING_COUNT,
              height: (size * (i + 1)) / RING_COUNT,
              borderRadius: (size * (i + 1)) / RING_COUNT / 2,
              left: center - (size * (i + 1)) / RING_COUNT / 2,
              top: center - (size * (i + 1)) / RING_COUNT / 2,
            },
          ]}
        />
      ))}

      <View style={[styles.crossH, { top: center - 0.5, left: 0, right: 0 }]} />
      <View style={[styles.crossV, { left: center - 0.5, top: 0, bottom: 0 }]} />

      {enemies.map((enemy: any) => {
        const pos = bearingRangeToOffset(
          enemy.bearing - heading,
          enemy.range * (size / 2 - 6)
        );
        return (
          <View
            key={enemy.id}
            style={[
              styles.blip,
              {
                left: center + pos.x - 5,
                top: center + pos.y - 5,
                backgroundColor: enemy.identified ? Colors.red : Colors.amber,
                opacity: 0.6 + (enemy.strength || 0) * 0.4,
                shadowColor: enemy.identified ? Colors.red : Colors.amber,
                shadowRadius: 6,
                shadowOpacity: 0.9,
              },
            ]}
          />
        );
      })}

      <View style={[styles.ownShip, { left: center - 4, top: center - 4 }]} />

      <Text style={styles.hdgLabel}>{bearingLabel(heading)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
    gap: 0,
  },
  leftPanel: {
    width: 230,
    padding: 10,
    borderRightWidth: 1,
    borderRightColor: Colors.border,
    gap: 10,
  },
  rightPanel: {
    flex: 1,
    padding: 10,
  },
  radarWrap: {
    alignItems: 'center',
    backgroundColor: Colors.bgCard2,
    borderWidth: 1,
    borderColor: 'rgba(255,179,0,0.15)',
    borderRadius: 12,
    padding: 10,
  },
  radar: {
    position: 'relative',
    backgroundColor: 'rgba(0,20,8,0.9)',
    borderRadius: 100,
    overflow: 'hidden',
  },
  radarRing: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(0,255,88,0.12)',
  },
  crossH: {
    position: 'absolute',
    height: 1,
    backgroundColor: 'rgba(0,255,88,0.1)',
  },
  crossV: {
    position: 'absolute',
    width: 1,
    backgroundColor: 'rgba(0,255,88,0.1)',
  },
  blip: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    elevation: 2,
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
  hdgLabel: {
    position: 'absolute',
    top: 4,
    right: 6,
    fontFamily: 'Orbitron_400Regular',
    fontSize: 8,
    color: 'rgba(0,255,136,0.5)',
  },
  missionCard: {
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
    marginBottom: 10,
  },
  tactRow: {
    flexDirection: 'row',
    gap: 10,
  },
  tactStat: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 6,
    padding: 8,
  },
  tactVal: {
    fontFamily: 'Orbitron_900Black',
    fontSize: 20,
    color: Colors.amber,
  },
  tactLbl: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 7,
    color: Colors.textDim,
    letterSpacing: 1,
    marginTop: 2,
  },
  crewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.03)',
  },
  crewAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
  },
  crewDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  crewName: {
    fontFamily: 'Orbitron_400Regular',
    fontSize: 9,
    flex: 1,
    letterSpacing: 1,
  },
  crewRole: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 8,
    color: Colors.textDim,
  },
  crewOnline: {},
  crewOnlineText: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 7,
    color: Colors.green,
    letterSpacing: 1,
  },
  actionLogCard: {
    flex: 1,
    backgroundColor: Colors.bgCard2,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 12,
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
