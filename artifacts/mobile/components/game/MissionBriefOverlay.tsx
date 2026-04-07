import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
} from 'react-native';
import { useGame } from '@/contexts/GameContext';
import { Colors } from '@/constants/Colors';

/**
 * MissionBriefOverlay — full-screen modal shown when a new mission with a
 * `brief` field becomes active. Acts as the "intel briefing screen" before
 * the first step is interactable.
 *
 * Behavior:
 *   - Shows when activeMissionThread.brief exists AND the brief has not
 *     been dismissed for the current mission key.
 *   - 10-second minimum delay before the dismiss button appears (so the
 *     captain can read the brief aloud to the family).
 *   - Captain-only dismiss button. Crew sees "Awaiting Captain..." after
 *     the 10s countdown.
 *   - Dismiss is server-coordinated: captain taps → server broadcasts
 *     MISSION_BRIEF_DISMISS → all clients clear simultaneously.
 *
 * Visually distinct from MissionCompleteOverlay (no glitch effect — clean
 * military intel briefing aesthetic).
 */
const MIN_DISMISS_DELAY_MS = 10_000;

export function MissionBriefOverlay() {
  const {
    activeMissionThread,
    briefDismissedFor,
    dismissMissionBrief,
    myRole,
  } = useGame();

  const [secondsRemaining, setSecondsRemaining] = useState(
    Math.ceil(MIN_DISMISS_DELAY_MS / 1000)
  );

  // Reset countdown whenever a new mission with a brief becomes active
  useEffect(() => {
    if (!activeMissionThread?.brief) return;
    if (briefDismissedFor === activeMissionThread.key) return;

    setSecondsRemaining(Math.ceil(MIN_DISMISS_DELAY_MS / 1000));
    const interval = setInterval(() => {
      setSecondsRemaining((s) => {
        if (s <= 1) {
          clearInterval(interval);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [activeMissionThread?.key, activeMissionThread?.brief, briefDismissedFor]);

  if (!activeMissionThread?.brief) return null;
  if (briefDismissedFor === activeMissionThread.key) return null;

  const isCaptain = myRole === 'c';
  const canDismiss = secondsRemaining === 0;
  const countdownLabel =
    secondsRemaining > 0
      ? `BRIEFING \u2014 ${String(Math.floor(secondsRemaining / 60)).padStart(1, '0')}:${String(secondsRemaining % 60).padStart(2, '0')}`
      : 'BRIEFING COMPLETE';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.overlay}>
        {/* Outer frame */}
        <View style={styles.frame}>
          {/* Badge */}
          <View style={styles.badgeWrap}>
            <View style={styles.badgeDot} />
            <Text style={styles.badgeText}>{activeMissionThread.badge}</Text>
            <View style={styles.badgeDot} />
          </View>

          {/* Mission name */}
          <Text style={styles.missionName}>{activeMissionThread.name}</Text>

          {/* Top divider */}
          <View style={styles.dividerWrap}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerLabel}>MISSION BRIEF</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Brief body */}
          <View style={styles.bodyWrap}>
            <Text style={styles.bodyText}>"{activeMissionThread.brief}"</Text>
          </View>

          {/* Bottom divider */}
          <View style={styles.dividerLine} />

          {/* Status row */}
          <Text style={styles.countdownLabel}>{countdownLabel}</Text>

          {/* Action area */}
          {canDismiss ? (
            isCaptain ? (
              <TouchableOpacity
                style={styles.beginBtn}
                onPress={dismissMissionBrief}
                activeOpacity={0.8}
              >
                <Text style={styles.beginBtnText}>\u25B6  BEGIN MISSION</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.awaitingBox}>
                <Text style={styles.awaitingText}>AWAITING CAPTAIN\u2026</Text>
              </View>
            )
          ) : (
            <View style={styles.preBtnPlaceholder}>
              <Text style={styles.preBtnText}>
                {isCaptain
                  ? 'BEGIN MISSION button unlocks in ' + secondsRemaining + 's'
                  : 'Captain will begin the mission'}
              </Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(2,6,10,0.97)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  frame: {
    width: '100%',
    maxWidth: 560,
    borderWidth: 1.5,
    borderColor: 'rgba(255,179,0,0.35)',
    backgroundColor: 'rgba(8,14,22,0.95)',
    borderRadius: 6,
    paddingHorizontal: 28,
    paddingVertical: 32,
    alignItems: 'center',
  },
  badgeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.amber,
  },
  badgeText: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 10,
    color: Colors.amber,
    letterSpacing: 4,
  },
  missionName: {
    fontFamily: 'Orbitron_900Black',
    fontSize: 22,
    color: '#ffffff',
    letterSpacing: 2,
    textAlign: 'center',
    lineHeight: 28,
    marginBottom: 24,
  },
  dividerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    marginBottom: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,179,0,0.25)',
  },
  dividerLabel: {
    fontFamily: 'Orbitron_400Regular',
    fontSize: 8,
    color: 'rgba(255,179,0,0.6)',
    letterSpacing: 3,
  },
  bodyWrap: {
    width: '100%',
    paddingVertical: 16,
    paddingHorizontal: 8,
    marginBottom: 16,
  },
  bodyText: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 14,
    color: '#cccccc',
    lineHeight: 22,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  countdownLabel: {
    fontFamily: 'Orbitron_400Regular',
    fontSize: 9,
    color: 'rgba(255,179,0,0.5)',
    letterSpacing: 2,
    marginTop: 12,
    marginBottom: 16,
  },
  beginBtn: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderWidth: 2,
    borderColor: Colors.amber,
    backgroundColor: 'rgba(255,179,0,0.12)',
    borderRadius: 6,
  },
  beginBtnText: {
    fontFamily: 'Orbitron_900Black',
    fontSize: 14,
    color: Colors.amber,
    letterSpacing: 4,
  },
  awaitingBox: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  awaitingText: {
    fontFamily: 'Orbitron_400Regular',
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 3,
  },
  preBtnPlaceholder: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  preBtnText: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 9,
    color: 'rgba(255,255,255,0.3)',
    letterSpacing: 1,
  },
});
