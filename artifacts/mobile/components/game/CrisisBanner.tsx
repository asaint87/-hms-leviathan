import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Colors } from '@/constants/Colors';

interface Props {
  crisis: {
    crisisId: string;
    def: { title: string; description: string };
  };
}

export function CrisisBanner({ crisis }: Props) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 600, useNativeDriver: false }),
      ])
    ).start();
    return () => pulse.stopAnimation();
  }, []);

  const borderColor = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(255,48,48,0.3)', 'rgba(255,48,48,0.9)'],
  });

  return (
    <Animated.View style={[styles.banner, { borderColor }]}>
      <View style={styles.dotWrap}>
        <Animated.View style={[styles.dot, { opacity: pulse }]} />
      </View>
      <Text style={styles.title}>{crisis.def.title}</Text>
      <Text style={styles.desc}>{crisis.def.description}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,48,48,0.12)',
    borderWidth: 1,
    borderLeftWidth: 3,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 10,
  },
  dotWrap: {
    width: 10,
    height: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.red,
  },
  title: {
    fontFamily: 'Orbitron_900Black',
    fontSize: 10,
    color: Colors.red,
    letterSpacing: 2,
  },
  desc: {
    fontFamily: 'ShareTechMono_400Regular',
    fontSize: 9,
    color: 'rgba(255,48,48,0.7)',
    flex: 1,
    letterSpacing: 0.5,
  },
});
