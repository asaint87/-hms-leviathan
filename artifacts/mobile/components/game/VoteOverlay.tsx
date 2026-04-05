import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import { useGame, VoteState } from '@/contexts/GameContext';
import { Colors } from '@/constants/Colors';

const VOTE_DURATION = 60;

interface Props {
  voteState: VoteState;
}

export function VoteOverlay({ voteState }: Props) {
  const { castVote } = useGame();
  const [timeLeft, setTimeLeft] = useState(VOTE_DURATION);
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 800, useNativeDriver: false }),
      ])
    ).start();

    const timer = setInterval(() => {
      setTimeLeft((t) => Math.max(0, t - 1));
    }, 1000);

    return () => {
      pulse.stopAnimation();
      clearInterval(timer);
    };
  }, []);

  const timerColor = timeLeft > 20 ? Colors.amber : Colors.red;
  const progress = timeLeft / VOTE_DURATION;

  return (
    <View style={styles.overlay}>
      <View style={styles.sourceBadge}>
        <Animated.View style={[styles.sourceDot, { opacity: pulse }]} />
        <Text style={styles.sourceLabel}>CAPTAIN'S DECISION</Text>
      </View>

      <View style={styles.crewVoteBadge}>
        <Text style={styles.crewVoteText}>CREW VOTE</Text>
      </View>

      <Text style={styles.question}>{voteState.context}</Text>

      <View style={styles.timerWrap}>
        <Text style={[styles.timer, { color: timerColor }]}>{timeLeft}</Text>
        <Text style={styles.timerLbl}>SECONDS TO VOTE</Text>
        <View style={styles.timerBarWrap}>
          <View
            style={[
              styles.timerBar,
              { width: `${progress * 100}%` as any, backgroundColor: timerColor },
            ]}
          />
        </View>
      </View>

      <View style={styles.choices}>
        {voteState.options.map((option, i) => {
          const selected = voteState.myVote === option;
          const isA = i === 0;
          const c = isA ? Colors.amber : Colors.teal;
          return (
            <TouchableOpacity
              key={option}
              style={[
                styles.choiceBtn,
                { borderColor: selected ? c : c + '40', backgroundColor: selected ? c + '18' : c + '08' },
              ]}
              onPress={() => castVote(option)}
              activeOpacity={0.8}
            >
              <Text style={[styles.choiceLabel, { color: c }]}>
                OPTION {isA ? 'A' : 'B'}
              </Text>
              <Text style={styles.choiceText}>{option}</Text>
              {selected && (
                <Text style={[styles.selectedBadge, { color: c }]}>✓ YOUR VOTE</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.tally}>
        <Text style={styles.tallyLabel}>VOTES CAST: {Object.keys(voteState.votes).length}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 800,
    backgroundColor: 'rgba(2,8,16,0.96)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  sourceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sourceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.amber,
  },
  sourceLabel: {
    fontFamily: 'Orbitron_400Regular',
    fontSize: 9,
    color: 'rgba(255,179,0,0.6)',
    letterSpacing: 3,
  },
  crewVoteBadge: {
    backgroundColor: 'rgba(255,48,48,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,48,48,0.4)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginBottom: 20,
  },
  crewVoteText: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 9,
    color: Colors.red,
    letterSpacing: 3,
  },
  question: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 16,
    color: Colors.white,
    textAlign: 'center',
    letterSpacing: 1,
    lineHeight: 24,
    maxWidth: 500,
    marginBottom: 10,
  },
  timerWrap: {
    alignItems: 'center',
    marginBottom: 28,
    gap: 6,
  },
  timer: {
    fontFamily: 'Orbitron_900Black',
    fontSize: 48,
    lineHeight: 52,
  },
  timerLbl: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 9,
    color: Colors.textDim,
    letterSpacing: 3,
  },
  timerBarWrap: {
    width: 200,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  timerBar: {
    height: '100%',
    borderRadius: 2,
  },
  choices: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    maxWidth: 560,
    marginBottom: 16,
  },
  choiceBtn: {
    flex: 1,
    padding: 18,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'flex-start',
    gap: 6,
  },
  choiceLabel: {
    fontFamily: 'Orbitron_400Regular',
    fontSize: 8,
    letterSpacing: 2,
  },
  choiceText: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 11,
    color: Colors.text,
    lineHeight: 16,
  },
  selectedBadge: {
    fontFamily: 'Orbitron_400Regular',
    fontSize: 8,
    letterSpacing: 1,
    marginTop: 4,
  },
  tally: {
    alignItems: 'center',
  },
  tallyLabel: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 10,
    color: Colors.textDim,
    letterSpacing: 2,
  },
});
