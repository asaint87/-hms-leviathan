import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Animated,
  Easing,
} from 'react-native';
import { useGame } from '@/contexts/GameContext';
import { Colors } from '@/constants/Colors';

/**
 * MissionCompleteOverlay — full-screen overlay shown when a mission completes
 * with a handoff. Triggered by the MISSION_COMPLETE_OVERLAY message from the
 * server (via context.completionOverlay).
 *
 * Features:
 *   - Glitch text effect on the title (3 stacked Text layers, no extra deps)
 *   - Body text below the title
 *   - Auto-dismisses when context.completionOverlay clears (after handoff)
 *   - Optional countdown ("STARTING IN 5...")
 */
export function MissionCompleteOverlay() {
  const { completionOverlay } = useGame();
  const [countdown, setCountdown] = useState<number | null>(null);

  // Glitch animation drivers (3 layers max per spec)
  const redOffset = useRef(new Animated.Value(0)).current;
  const cyanOffset = useRef(new Animated.Value(0)).current;
  const flickerOpacity = useRef(new Animated.Value(1)).current;

  // Run glitch loop while overlay is visible
  useEffect(() => {
    if (!completionOverlay) {
      redOffset.setValue(0);
      cyanOffset.setValue(0);
      flickerOpacity.setValue(1);
      return;
    }
    if (!completionOverlay.glitch) return;

    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      // Random offsets in the range [-3, 3] px
      const r = (Math.random() - 0.5) * 6;
      const c = (Math.random() - 0.5) * 6;
      const flicker = Math.random() > 0.93 ? 0.4 : 1;

      Animated.parallel([
        Animated.timing(redOffset, {
          toValue: r,
          duration: 80,
          easing: Easing.linear,
          useNativeDriver: false,
        }),
        Animated.timing(cyanOffset, {
          toValue: c,
          duration: 80,
          easing: Easing.linear,
          useNativeDriver: false,
        }),
        Animated.timing(flickerOpacity, {
          toValue: flicker,
          duration: 60,
          easing: Easing.linear,
          useNativeDriver: false,
        }),
      ]).start(() => {
        if (!cancelled) setTimeout(tick, 80 + Math.random() * 120);
      });
    };

    tick();
    return () => {
      cancelled = true;
    };
  }, [completionOverlay?.glitch, completionOverlay?.title]);

  // Countdown
  useEffect(() => {
    if (!completionOverlay?.delayMs) {
      setCountdown(null);
      return;
    }
    const totalSeconds = Math.ceil(completionOverlay.delayMs / 1000);
    setCountdown(totalSeconds);
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c === null || c <= 1) {
          clearInterval(interval);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [completionOverlay?.delayMs, completionOverlay?.title]);

  if (!completionOverlay) return null;

  const { title, glitch, body, nextMissionKey } = completionOverlay;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.overlay}>
        <View style={styles.scanlines} pointerEvents="none" />

        <View style={styles.titleWrap}>
          {glitch ? (
            <>
              {/* Layer 1: red offset */}
              <Animated.Text
                style={[
                  styles.titleText,
                  styles.titleRed,
                  {
                    transform: [{ translateX: redOffset }],
                    opacity: flickerOpacity,
                  },
                ]}
              >
                {title}
              </Animated.Text>
              {/* Layer 2: cyan offset */}
              <Animated.Text
                style={[
                  styles.titleText,
                  styles.titleCyan,
                  {
                    transform: [{ translateX: cyanOffset }],
                    opacity: flickerOpacity,
                  },
                ]}
              >
                {title}
              </Animated.Text>
              {/* Layer 3: white on top */}
              <Animated.Text
                style={[
                  styles.titleText,
                  styles.titleWhite,
                  { opacity: flickerOpacity },
                ]}
              >
                {title}
              </Animated.Text>
            </>
          ) : (
            <Text style={[styles.titleText, styles.titleWhite]}>{title}</Text>
          )}
        </View>

        {body ? (
          <View style={styles.bodyWrap}>
            {body.split('\n').map((line, i) => (
              <Text key={i} style={styles.bodyText}>
                {line}
              </Text>
            ))}
          </View>
        ) : null}

        {countdown !== null && nextMissionKey && (
          <View style={styles.countdownWrap}>
            <Text style={styles.countdownLabel}>NEXT MISSION</Text>
            <Text style={styles.countdownMission}>{nextMissionKey}</Text>
            <Text style={styles.countdownValue}>
              STARTING IN {countdown}...
            </Text>
          </View>
        )}
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
  scanlines: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    opacity: 0.1,
  },
  titleWrap: {
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    marginBottom: 24,
  },
  titleText: {
    fontFamily: 'Orbitron_900Black',
    fontSize: 36,
    letterSpacing: 4,
    textAlign: 'center',
    position: 'absolute',
  },
  titleRed: { color: '#ff0044' },
  titleCyan: { color: '#00e5ff' },
  titleWhite: { color: '#ffffff' },
  bodyWrap: {
    maxWidth: 520,
    marginBottom: 28,
    alignItems: 'center',
  },
  bodyText: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 12,
    color: Colors.textDim,
    letterSpacing: 1,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 4,
  },
  countdownWrap: {
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,179,0,0.2)',
    paddingTop: 16,
    marginTop: 8,
  },
  countdownLabel: {
    fontFamily: 'Orbitron_400Regular',
    fontSize: 8,
    color: Colors.textDim,
    letterSpacing: 3,
    marginBottom: 4,
  },
  countdownMission: {
    fontFamily: 'Orbitron_900Black',
    fontSize: 22,
    color: Colors.amber,
    letterSpacing: 4,
    marginBottom: 6,
  },
  countdownValue: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 10,
    color: Colors.amber,
    letterSpacing: 2,
  },
});
