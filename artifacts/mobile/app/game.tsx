import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useGame, RoleKey, ROLE_NAMES } from '@/contexts/GameContext';
import { Colors } from '@/constants/Colors';
import { HullBar } from '@/components/game/HullBar';
import { CrisisBanner } from '@/components/game/CrisisBanner';
import { VoteOverlay } from '@/components/game/VoteOverlay';
import { MissionCompleteOverlay } from '@/components/game/MissionCompleteOverlay';
import { MissionBriefOverlay } from '@/components/game/MissionBriefOverlay';
import { CaptainStation } from '@/components/stations/CaptainStation';
import { NavigatorStation } from '@/components/stations/NavigatorStation';
import { SonarStation } from '@/components/stations/SonarStation';
import { EngineerStation } from '@/components/stations/EngineerStation';
import { WeaponsStation } from '@/components/stations/WeaponsStation';

const STATIONS: { key: RoleKey; icon: string; label: string }[] = [
  { key: 'c', icon: 'shield-star', label: 'CMD' },
  { key: 'n', icon: 'compass', label: 'NAV' },
  { key: 's', icon: 'radar', label: 'SON' },
  { key: 'e', icon: 'cog', label: 'ENG' },
  { key: 'w', icon: 'target', label: 'WPN' },
];

export default function GameScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { phase, world, crisis, voteState, leaveGame, myRole, roomCode } = useGame();
  const [activeStation, setActiveStation] = useState<RoleKey>(myRole);
  const [showEndModal, setShowEndModal] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let cleanup: (() => void) | undefined;
    import('expo-screen-orientation').then((mod) => {
      mod.lockAsync(mod.OrientationLock.LANDSCAPE).catch(() => {});
      cleanup = () => { mod.unlockAsync().catch(() => {}); };
    }).catch(() => {});
    return () => { cleanup?.(); };
  }, []);

  useEffect(() => {
    if (phase === 'MENU') {
      router.replace('/');
    } else if (phase === 'LOBBY') {
      router.replace('/waiting');
    } else if (phase === 'COMPLETE') {
      setShowEndModal(true);
    }
  }, [phase]);

  const handleLeave = () => {
    leaveGame();
    router.replace('/');
  };

  const col = Colors.roles[activeStation];

  const renderStation = () => {
    switch (activeStation) {
      case 'c': return <CaptainStation />;
      case 'n': return <NavigatorStation />;
      case 's': return <SonarStation />;
      case 'e': return <EngineerStation />;
      case 'w': return <WeaponsStation />;
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {crisis && <CrisisBanner crisis={crisis} />}
      {voteState && <VoteOverlay voteState={voteState} />}
      <MissionCompleteOverlay />
      <MissionBriefOverlay />

      <HullBar roomCode={roomCode} />

      <View style={styles.stationNav}>
        <Text style={styles.shipName}>HMS LEVIATHAN</Text>
        <View style={styles.tabs}>
          {STATIONS.map((s) => {
            const active = s.key === activeStation;
            const c = Colors.roles[s.key];
            return (
              <TouchableOpacity
                key={s.key}
                style={[styles.tab, active && { borderBottomColor: c.primary }]}
                onPress={() => {
                  setActiveStation(s.key);
                  Haptics.selectionAsync();
                }}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons
                  name={s.icon as any}
                  size={18}
                  color={active ? c.primary : Colors.textDim}
                />
                <Text style={[styles.tabLabel, { color: active ? c.primary : Colors.textDim }]}>
                  {s.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <TouchableOpacity style={styles.leaveBtn} onPress={() => setShowLeaveConfirm(true)}>
          <MaterialCommunityIcons name="exit-run" size={16} color={Colors.red} />
          <Text style={styles.leaveBtnText}>LEAVE</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.stationContent}>
        {renderStation()}
      </View>

      <Modal visible={showLeaveConfirm} transparent animationType="fade" onRequestClose={() => setShowLeaveConfirm(false)}>
        <View style={styles.endOverlay}>
          <View style={[styles.endCard, { borderColor: Colors.red }]}>
            <Text style={[styles.endTitle, { color: Colors.red, fontSize: 22, lineHeight: 28 }]}>
              ABANDON{'\n'}SHIP?
            </Text>
            {roomCode && (
              <Text style={styles.leaveRoomCode}>
                Room code: {roomCode} — share this to rejoin
              </Text>
            )}
            <View style={styles.leaveActions}>
              <TouchableOpacity
                style={[styles.endBtn, { borderColor: Colors.textDim }]}
                onPress={() => setShowLeaveConfirm(false)}
              >
                <Text style={[styles.endBtnText, { color: Colors.textDim }]}>STAY</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.endBtn, { borderColor: Colors.red, backgroundColor: 'rgba(255,48,48,0.12)' }]}
                onPress={handleLeave}
              >
                <Text style={[styles.endBtnText, { color: Colors.red }]}>LEAVE GAME</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showEndModal} transparent animationType="fade">
        <View style={styles.endOverlay}>
          <View style={styles.endCard}>
            <Text style={styles.endTitle}>
              {phase === 'COMPLETE' && world && world.submarine.hullIntegrity > 0
                ? 'MISSION\nCOMPLETE'
                : 'GAME\nOVER'}
            </Text>
            {world && (
              <View style={styles.endStats}>
                <View style={styles.endStat}>
                  <Text style={styles.endStatVal}>{Math.round(world.submarine.hullIntegrity)}%</Text>
                  <Text style={styles.endStatLbl}>HULL</Text>
                </View>
                <View style={styles.endStat}>
                  <Text style={styles.endStatVal}>
                    {world.contacts.filter((c) => c.destroyed).length}/
                    {world.contacts.length}
                  </Text>
                  <Text style={styles.endStatLbl}>TARGETS</Text>
                </View>
              </View>
            )}
            <Text style={styles.endSub}>Outstanding crew performance!</Text>
            <TouchableOpacity style={styles.endBtn} onPress={handleLeave}>
              <Text style={styles.endBtnText}>RETURN TO PORT</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  stationNav: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: 8,
    height: 46,
  },
  shipName: {
    fontFamily: 'Orbitron_900Black',
    fontSize: 8,
    color: Colors.amber,
    letterSpacing: 2,
    width: 90,
    lineHeight: 12,
  },
  tabs: {
    flex: 1,
    flexDirection: 'row',
    height: '100%',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabLabel: {
    fontFamily: 'Orbitron_400Regular',
    fontSize: 7,
    letterSpacing: 1,
  },
  leaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,48,48,0.3)',
    borderRadius: 6,
    backgroundColor: 'rgba(255,48,48,0.06)',
  },
  leaveBtnText: {
    fontFamily: 'Orbitron_400Regular',
    fontSize: 7,
    color: Colors.red,
    letterSpacing: 1,
  },
  leaveRoomCode: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 11,
    color: Colors.amber,
    letterSpacing: 1,
    textAlign: 'center',
    marginBottom: 20,
  },
  leaveActions: {
    flexDirection: 'row',
    gap: 16,
  },
  stationContent: {
    flex: 1,
  },
  endOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2,8,16,0.97)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  endCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: Colors.bgCard2,
    borderWidth: 2,
    borderColor: Colors.amber,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
  },
  endTitle: {
    fontFamily: 'Orbitron_900Black',
    fontSize: 32,
    color: Colors.amber,
    textAlign: 'center',
    letterSpacing: 4,
    lineHeight: 38,
    marginBottom: 24,
    textShadowColor: 'rgba(255,179,0,0.3)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  endStats: {
    flexDirection: 'row',
    gap: 32,
    marginBottom: 20,
  },
  endStat: {
    alignItems: 'center',
  },
  endStatVal: {
    fontFamily: 'Orbitron_900Black',
    fontSize: 28,
    color: Colors.green,
  },
  endStatLbl: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 9,
    color: Colors.textDim,
    letterSpacing: 2,
    marginTop: 4,
  },
  endSub: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 11,
    color: Colors.textDim,
    letterSpacing: 1,
    marginBottom: 28,
  },
  endBtn: {
    backgroundColor: 'rgba(255,179,0,0.12)',
    borderWidth: 1,
    borderColor: Colors.amber,
    borderRadius: 8,
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  endBtnText: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 12,
    color: Colors.amber,
    letterSpacing: 2,
  },
});
