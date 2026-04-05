import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ScrollView,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { useGame, ROLE_NAMES, RoleKey } from '@/contexts/GameContext';
import { Colors } from '@/constants/Colors';
import { useThemeMusic } from '@/hooks/useThemeMusic';

const domain = process.env.EXPO_PUBLIC_DOMAIN ?? '';

const ROLE_ICONS: Record<RoleKey, string> = {
  c: 'shield-star',
  n: 'compass',
  s: 'radar',
  e: 'cog',
  w: 'target',
};

export default function WaitingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { roomCode, players, phase, myRole, startGame, leaveGame } = useGame();
  const { stop } = useThemeMusic();

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  React.useEffect(() => {
    if (phase === 'PLAYING') {
      stop(true).then(() => router.replace('/game'));
    } else if (phase === 'MENU') {
      stop(false).then(() => router.replace('/'));
    }
  }, [phase]);

  const handleStart = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    startGame();
  };

  const handleLeave = () => {
    leaveGame();
    router.replace('/');
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingTop: topPad + 16, paddingBottom: botPad + 24 }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={styles.subText}>AWAITING CREW</Text>
        <Text style={styles.codeLabel}>ROOM CODE</Text>
        <Text style={styles.code}>{roomCode || '—'}</Text>
        {roomCode && domain ? (
          <View style={styles.qrWrap}>
            <QRCode
              value={`https://${domain}/?join=${roomCode}`}
              size={140}
              color={Colors.amber}
              backgroundColor="#0a0e1a"
            />
            <Text style={styles.qrLabel}>SCAN TO JOIN</Text>
            <Text style={styles.qrSub}>Opens in any browser · no app needed</Text>
          </View>
        ) : (
          <Text style={styles.shareHint}>Share this code with your crew</Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>CREW MANIFEST — {players.length} ABOARD</Text>
        {players.length === 0 && (
          <Text style={styles.emptyText}>No crew yet...</Text>
        )}
        {players.map((p, i) => {
          const col = Colors.roles[p.role as RoleKey] || Colors.roles.c;
          return (
            <View key={`${p.name}-${i}`} style={styles.playerRow}>
              <View style={[styles.roleIcon, { backgroundColor: col.bg, borderColor: col.primary }]}>
                {p.avatar ? (
                  <Image source={{ uri: p.avatar }} style={styles.avatarImg} />
                ) : (
                  <MaterialCommunityIcons
                    name={(ROLE_ICONS[p.role as RoleKey] || 'account') as any}
                    size={18}
                    color={col.primary}
                  />
                )}
              </View>
              <View style={styles.playerInfo}>
                <Text style={[styles.playerName, { color: col.primary }]}>{p.name}</Text>
                <Text style={styles.playerRole}>{ROLE_NAMES[p.role as RoleKey]}</Text>
              </View>
              <View style={[styles.statusDot, { backgroundColor: Colors.green }]} />
            </View>
          );
        })}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>MINIMUM CREW</Text>
        <View style={styles.roleChecklist}>
          {(['c', 'n', 's', 'e', 'w'] as RoleKey[]).map((r) => {
            const filled = players.some((p) => p.role === r);
            const col = Colors.roles[r];
            return (
              <View key={r} style={styles.checkRow}>
                <View
                  style={[
                    styles.checkDot,
                    { backgroundColor: filled ? col.primary : 'transparent', borderColor: filled ? col.primary : '#333' },
                  ]}
                />
                <Text style={[styles.checkName, { color: filled ? col.primary : Colors.textDim }]}>
                  {ROLE_NAMES[r]}
                </Text>
                <Text style={[styles.checkStatus, { color: filled ? Colors.green : Colors.textDim }]}>
                  {filled ? '● READY' : '○ OPEN'}
                </Text>
              </View>
            );
          })}
        </View>
        <Text style={styles.hintText}>You can play with 1–5 players. At least 2 recommended.</Text>
      </View>

      <TouchableOpacity
        style={styles.startBtn}
        onPress={handleStart}
        activeOpacity={0.85}
      >
        <Text style={styles.startBtnText}>⚡  BATTLE STATIONS</Text>
        <Text style={styles.startBtnSub}>Start the mission</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.leaveBtn} onPress={handleLeave} activeOpacity={0.8}>
        <Text style={styles.leaveBtnText}>LEAVE SHIP</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  content: {
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  subText: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 9,
    color: Colors.textDim,
    letterSpacing: 4,
    marginBottom: 16,
  },
  codeLabel: {
    fontFamily: 'Orbitron_400Regular',
    fontSize: 9,
    color: Colors.textDim,
    letterSpacing: 3,
    marginBottom: 6,
  },
  code: {
    fontFamily: 'Orbitron_900Black',
    fontSize: 56,
    color: Colors.amber,
    letterSpacing: 12,
    textShadowColor: 'rgba(255,179,0,0.3)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  qrWrap: {
    marginTop: 20,
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.amber + '33',
    backgroundColor: 'rgba(255,179,0,0.04)',
    gap: 10,
  },
  qrLabel: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 11,
    color: Colors.amber,
    letterSpacing: 4,
  },
  qrSub: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 9,
    color: Colors.textDim,
    letterSpacing: 1,
  },
  shareHint: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 10,
    color: Colors.textDim,
    letterSpacing: 1,
    marginTop: 8,
  },
  card: {
    width: '100%',
    backgroundColor: Colors.bgCard2,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
  },
  cardLabel: {
    fontFamily: 'Orbitron_400Regular',
    fontSize: 8,
    color: Colors.textDim,
    letterSpacing: 3,
    marginBottom: 14,
  },
  emptyText: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 11,
    color: Colors.textDim,
    textAlign: 'center',
    padding: 16,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  roleIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
  avatarImg: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 12,
    letterSpacing: 1,
  },
  playerRole: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 10,
    color: Colors.textDim,
    marginTop: 2,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  roleChecklist: {
    gap: 10,
    marginBottom: 12,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
  },
  checkName: {
    fontFamily: 'Orbitron_400Regular',
    fontSize: 10,
    letterSpacing: 1,
    flex: 1,
  },
  checkStatus: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 9,
    letterSpacing: 1,
  },
  hintText: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 9,
    color: Colors.textDim,
    letterSpacing: 1,
    textAlign: 'center',
    marginTop: 8,
  },
  startBtn: {
    width: '100%',
    backgroundColor: 'rgba(255,179,0,0.1)',
    borderWidth: 2,
    borderColor: Colors.amber,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 12,
  },
  startBtnText: {
    fontFamily: 'Orbitron_900Black',
    fontSize: 18,
    color: Colors.amber,
    letterSpacing: 3,
    textShadowColor: 'rgba(255,179,0,0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  startBtnSub: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 9,
    color: Colors.textDim,
    letterSpacing: 2,
    marginTop: 4,
  },
  leaveBtn: {
    padding: 14,
  },
  leaveBtnText: {
    fontFamily: 'Orbitron_400Regular',
    fontSize: 10,
    color: Colors.textDim,
    letterSpacing: 2,
  },
});
