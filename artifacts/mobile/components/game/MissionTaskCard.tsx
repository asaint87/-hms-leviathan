import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useGame, RoleKey, ROLE_NAMES } from '@/contexts/GameContext';
import { Colors } from '@/constants/Colors';
import * as Haptics from 'expo-haptics';

/**
 * Mission Task Card — engine-driven.
 *
 * Reads the active mission thread (sent from server via MISSION_ACTIVE)
 * and shows:
 *   - The captain's line for the current step (captain only)
 *   - The crew member's task (crew only)
 *   - Crew confirmation pills (everyone)
 *   - REPORT READY button (crew) / ADVANCE button (captain)
 *
 * If there is no active mission thread, this renders nothing.
 */
export function MissionTaskCard() {
  const {
    activeMissionThread,
    activeStepIdx,
    stepConfirmations,
    myRole,
    players,
    reportReady,
    captainAdvanceStep,
  } = useGame();

  const [reported, setReported] = useState(false);

  // Reset local "reported" flag when the step changes
  useEffect(() => {
    setReported(false);
  }, [activeStepIdx, activeMissionThread?.key]);

  if (!activeMissionThread) return null;

  const step = activeMissionThread.steps[activeStepIdx];
  if (!step) return null;

  const isCaptain = myRole === 'c';
  const myTask = step.crewTasks[myRole];
  const roleColor = Colors.roles[myRole]?.primary ?? Colors.amber;

  // Confirmations for the current step
  const confirmedRoles = stepConfirmations[step.id] ?? [];
  const iAmConfirmed = confirmedRoles.includes(myRole);

  // Determine which roles' pills to show — the step's waitFor list,
  // or fallback to all present roles if waitFor is empty
  const presentRoles = Array.from(new Set(players.map((p) => p.role as RoleKey)));
  const pillRoles =
    step.waitFor.length > 0
      ? step.waitFor
      : presentRoles;

  const pendingCount = pillRoles.filter((r) => !confirmedRoles.includes(r)).length;

  const handleReady = () => {
    reportReady();
    setReported(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleAdvance = () => {
    captainAdvanceStep();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  return (
    <View style={[styles.card, { borderColor: roleColor + '50' }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={[styles.dot, { backgroundColor: roleColor }]} />
        <Text style={styles.headerText}>
          {activeMissionThread.badge} \u00B7 STEP {activeStepIdx + 1} OF {activeMissionThread.steps.length}
        </Text>
      </View>

      {/* Captain dialogue (visible to all, but emphasized for captain) */}
      {step.captainSay && (
        <View style={styles.captainSayBox}>
          <Text style={styles.captainSayText}>{step.captainSay}</Text>
          {isCaptain && step.captainHint && (
            <Text style={styles.captainHint}>{step.captainHint}</Text>
          )}
        </View>
      )}

      {/* My task (crew only) */}
      {!isCaptain && myTask && (
        <View style={[styles.taskBox, { borderLeftColor: roleColor }]}>
          <Text style={[styles.taskText, { color: roleColor }]}>{myTask.text}</Text>
          {myTask.hint && (
            <Text style={styles.taskHint}>{myTask.hint}</Text>
          )}
        </View>
      )}

      {/* Crew confirmation pills */}
      {pillRoles.length > 0 && (
        <View style={styles.pillsRow}>
          {pillRoles.map((role) => {
            const ready = confirmedRoles.includes(role);
            const rc = Colors.roles[role]?.primary ?? '#555';
            return (
              <View
                key={role}
                style={[
                  styles.pill,
                  { borderColor: ready ? rc : 'rgba(255,255,255,0.1)' },
                  ready && { backgroundColor: rc + '20' },
                ]}
              >
                <View style={[styles.pillDot, { backgroundColor: ready ? rc : '#333' }]} />
                <Text style={[styles.pillLabel, { color: ready ? rc : '#444' }]}>
                  {(ROLE_NAMES[role] ?? role).toUpperCase().slice(0, 3)}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Pending count */}
      {pendingCount > 0 && (
        <Text style={styles.waitingText}>
          Waiting for {pendingCount} station{pendingCount !== 1 ? 's' : ''}
        </Text>
      )}

      {/* Crew READY button */}
      {!isCaptain && !iAmConfirmed && !reported && myTask && (
        <TouchableOpacity
          style={[styles.readyBtn, { borderColor: roleColor, backgroundColor: roleColor + '10' }]}
          onPress={handleReady}
          activeOpacity={0.8}
        >
          <Text style={[styles.readyBtnText, { color: roleColor }]}>
            \u2713 REPORT READY
          </Text>
        </TouchableOpacity>
      )}

      {/* Crew confirmed badge */}
      {!isCaptain && (iAmConfirmed || reported) && (
        <View style={[styles.readyBadge, { borderColor: roleColor + '40' }]}>
          <Text style={[styles.readyBadgeText, { color: roleColor }]}>\u2713 READY</Text>
        </View>
      )}

      {/* Captain manual advance */}
      {isCaptain && (
        <TouchableOpacity
          style={[styles.advanceBtn, { borderColor: Colors.amber }]}
          onPress={handleAdvance}
          activeOpacity={0.8}
        >
          <Text style={styles.advanceBtnText}>
            {pendingCount === 0
              ? '\u2192 CONTINUE TO NEXT STEP'
              : '\u23E9 ADVANCE (crew confirmed verbally)'}
          </Text>
        </TouchableOpacity>
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
    marginBottom: 8,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  headerText: {
    fontFamily: 'Orbitron_400Regular',
    fontSize: 7,
    color: Colors.textDim,
    letterSpacing: 2,
  },
  captainSayBox: {
    backgroundColor: 'rgba(255,179,0,0.06)',
    borderLeftWidth: 3,
    borderLeftColor: Colors.amber,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
    borderRadius: 4,
  },
  captainSayText: {
    fontFamily: 'Orbitron_400Regular',
    fontSize: 11,
    color: Colors.text,
    lineHeight: 16,
  },
  captainHint: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 8,
    color: 'rgba(255,179,0,0.5)',
    marginTop: 4,
  },
  taskBox: {
    borderLeftWidth: 3,
    paddingLeft: 8,
    paddingVertical: 4,
    marginBottom: 8,
  },
  taskText: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 11,
    letterSpacing: 1,
    marginBottom: 3,
  },
  taskHint: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 9,
    color: Colors.textDim,
    letterSpacing: 0.5,
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
    marginBottom: 6,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillLabel: {
    fontFamily: 'Orbitron_400Regular',
    fontSize: 7,
    letterSpacing: 1,
  },
  waitingText: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 8,
    color: Colors.textDim,
    marginBottom: 8,
    letterSpacing: 1,
  },
  readyBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    borderWidth: 2,
    borderRadius: 8,
    marginTop: 4,
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
    marginTop: 4,
  },
  readyBadgeText: {
    fontFamily: 'Orbitron_400Regular',
    fontSize: 9,
    letterSpacing: 2,
  },
  advanceBtn: {
    alignItems: 'center',
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 8,
    backgroundColor: 'rgba(255,179,0,0.06)',
    marginTop: 4,
  },
  advanceBtnText: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 9,
    color: Colors.amber,
    letterSpacing: 1,
  },
});
