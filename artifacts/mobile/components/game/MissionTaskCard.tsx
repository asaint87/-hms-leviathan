import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useGame, RoleKey } from '@/contexts/GameContext';
import { Colors } from '@/constants/Colors';

interface MissionTask {
  label: string;
  description: string;
}

type StepTasks = Partial<Record<RoleKey, MissionTask>>;

const MISSION_STEPS: Record<string, StepTasks[]> = {
  M01: [
    {
      c: { label: 'ASSESS SITUATION', description: 'Review tactical display and coordinate crew' },
      n: { label: 'HOLD POSITION', description: 'Maintain heading and await orders' },
      s: { label: 'DETECT CONTACTS', description: 'Use active ping to locate enemy vessels' },
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
  const { gameState, myRole } = useGame();

  if (!gameState) return null;

  const steps = MISSION_STEPS[gameState.missionId];
  if (!steps) return null;

  const step = Math.min(gameState.missionStep, steps.length - 1);
  const task = steps[step]?.[myRole];
  if (!task) return null;

  const roleColor = Colors.roles[myRole]?.primary ?? Colors.amber;

  return (
    <View style={[styles.card, { borderColor: roleColor + '30' }]}>
      <View style={styles.header}>
        <View style={[styles.dot, { backgroundColor: roleColor }]} />
        <Text style={styles.headerText}>MISSION OBJECTIVE</Text>
      </View>
      <Text style={[styles.label, { color: roleColor }]}>{task.label}</Text>
      <Text style={styles.description}>{task.description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255,179,0,0.04)',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
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
    fontSize: 10,
    letterSpacing: 1,
    marginBottom: 4,
  },
  description: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 9,
    color: Colors.textDim,
    letterSpacing: 0.5,
  },
});
