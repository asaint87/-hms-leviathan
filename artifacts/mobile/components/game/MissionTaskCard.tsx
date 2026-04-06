import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useGame, RoleKey, ROLE_NAMES } from '@/contexts/GameContext';
import { Colors } from '@/constants/Colors';
import * as Haptics from 'expo-haptics';

interface MissionTask {
  label: string;
  description: string;
}

type StepTasks = Partial<Record<RoleKey, MissionTask>>;

const MISSION_STEPS: Record<string, StepTasks[]> = {
  M01: [
    {
      c: { label: 'ALL HANDS REPORT', description: 'Order all stations to report ready' },
      n: { label: 'NAVIGATION READY', description: 'Confirm helm controls are operational' },
      s: { label: 'SONAR READY', description: 'Confirm sonar array is online' },
      e: { label: 'ENGINEERING READY', description: 'Confirm reactor and systems nominal' },
      w: { label: 'WEAPONS READY', description: 'Confirm torpedo tubes loaded' },
    },
    {
      c: { label: 'LOCATE HOSTILES', description: 'Order Sonar to ping and detect contacts' },
      n: { label: 'HOLD POSITION', description: 'Maintain heading and await orders' },
      s: { label: 'ACTIVE PING', description: 'Use sonar to detect all enemy contacts' },
      e: { label: 'SYSTEMS CHECK', description: 'Maintain reactor below 400\u00b0C' },
      w: { label: 'STANDBY', description: 'Await sonar contacts for targeting' },
    },
    {
      c: { label: 'COMMAND ATTACK', description: 'Direct crew to engage hostile targets' },
      n: { label: 'ATTACK HEADING', description: 'Close range to targets' },
      s: { label: 'TRACK CONTACTS', description: 'Keep sonar contact with all targets' },
      e: { label: 'LOAD TORPEDOES', description: 'Ensure all tubes are armed' },
      w: { label: 'ENGAGE TARGETS', description: 'Lock and fire on detected enemies' },
    },
  ],
};

export function MissionTaskCard() {
  const { gameState, myRole, crewReady, reportReady, players } = useGame();
  const [reported, setReported] = useState(false);

  if (!gameState) return null;

  const steps = MISSION_STEPS[gameState.missionId];
  if (!steps) return null;

  const step = Math.min(gameState.missionStep, steps.length - 1);
  const task = steps[step]?.[myRole];
  if (!task) return null;

  const roleColor = Colors.roles[myRole]?.primary ?? Colors.amber;
  const iAmReady = crewReady.includes(myRole);
  const isCaptain = myRole === 'c';

  // Reset reported flag when step changes
  React.useEffect(() => {
    setReported(false);
  }, [gameState.missionStep]);

  const handleReady = () => {
    reportReady();
    setReported(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  // Unique roles present in the game
  const presentRoles = Array.from(new Set(players.map((p) => p.role as RoleKey)));

  return (
    <View style={[styles.card, { borderColor: roleColor + '40' }]}>
      <View style={styles.header}>
        <View style={[styles.dot, { backgroundColor: roleColor }]} />
        <Text style={styles.headerText}>
          MISSION STEP {step + 1} — OBJECTIVE
        </Text>
      </View>
      <Text style={[styles.label, { color: roleColor }]}>{task.label}</Text>
      <Text style={styles.description}>{task.description}</Text>

      {/* Crew readiness pills — visible to everyone */}
      <View style={styles.readinessRow}>
        {presentRoles.map((role) => {
          const ready = crewReady.includes(role);
          const rc = Colors.roles[role]?.primary ?? '#555';
          return (
            <View
              key={role}
              style={[
                styles.readinessPill,
                { borderColor: ready ? rc : 'rgba(255,255,255,0.1)' },
                ready && { backgroundColor: rc + '20' },
              ]}
            >
              <View
                style={[
                  styles.readinessDot,
                  { backgroundColor: ready ? rc : '#333' },
                ]}
              />
              <Text
                style={[
                  styles.readinessLabel,
                  { color: ready ? rc : '#444' },
                ]}
              >
                {ROLE_NAMES[role]?.toUpperCase().slice(0, 3) ?? role.toUpperCase()}
              </Text>
            </View>
          );
        })}
      </View>

      {/* READY button */}
      {!iAmReady && !reported ? (
        <TouchableOpacity
          style={[styles.readyBtn, { borderColor: roleColor, backgroundColor: roleColor + '10' }]}
          onPress={handleReady}
          activeOpacity={0.8}
        >
          <Text style={[styles.readyBtnText, { color: roleColor }]}>
            {isCaptain ? '\u2713 ALL HANDS CONFIRMED' : '\u2713 REPORT READY'}
          </Text>
        </TouchableOpacity>
      ) : (
        <View style={[styles.readyBadge, { borderColor: roleColor + '40' }]}>
          <Text style={[styles.readyBadgeText, { color: roleColor }]}>
            \u2713 {isCaptain ? 'CONFIRMED' : 'READY'}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255,179,0,0.04)',
    borderWidth: 1.5,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  headerText: {
    fontFamily: 'Orbitron_400Regular',
    fontSize: 7,
    color: Colors.textDim,
    letterSpacing: 2,
  },
  label: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 11,
    letterSpacing: 1,
    marginBottom: 4,
  },
  description: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 9,
    color: Colors.textDim,
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  readinessRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  readinessPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  readinessDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  readinessLabel: {
    fontFamily: 'Orbitron_400Regular',
    fontSize: 7,
    letterSpacing: 1,
  },
  readyBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    borderWidth: 2,
    borderRadius: 8,
  },
  readyBtnText: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 11,
    letterSpacing: 2,
  },
  readyBadge: {
    alignItems: 'center',
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 8,
    backgroundColor: 'rgba(0,255,136,0.04)',
  },
  readyBadgeText: {
    fontFamily: 'Orbitron_400Regular',
    fontSize: 9,
    letterSpacing: 2,
  },
});
