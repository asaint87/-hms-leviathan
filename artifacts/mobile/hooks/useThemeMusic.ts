import { useEffect, useRef, useCallback } from 'react';
import { Audio, AVPlaybackStatus } from 'expo-av';

const THEME_ASSET = require('../assets/sounds/theme.mp3');

export function useThemeMusic() {
  const soundRef = useRef<Audio.Sound | null>(null);
  const stoppedRef = useRef(false);

  const stop = useCallback(async (fade = false) => {
    stoppedRef.current = true;
    const sound = soundRef.current;
    if (!sound) return;
    try {
      if (fade) {
        const steps = 10;
        for (let i = steps; i >= 0; i--) {
          await sound.setVolumeAsync(i / steps);
          await new Promise((r) => setTimeout(r, 40));
        }
      }
      await sound.stopAsync();
      await sound.unloadAsync();
    } catch {
    }
    soundRef.current = null;
  }, []);

  useEffect(() => {
    stoppedRef.current = false;

    let mounted = true;

    const load = async () => {
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
        });

        const { sound } = await Audio.Sound.createAsync(
          THEME_ASSET,
          {
            isLooping: true,
            volume: 0,
            shouldPlay: true,
          }
        );

        if (!mounted || stoppedRef.current) {
          await sound.unloadAsync();
          return;
        }

        soundRef.current = sound;

        const steps = 20;
        for (let i = 0; i <= steps; i++) {
          if (!mounted || stoppedRef.current) break;
          await sound.setVolumeAsync(i / steps);
          await new Promise((r) => setTimeout(r, 50));
        }
      } catch {
      }
    };

    load();

    return () => {
      mounted = false;
      const sound = soundRef.current;
      if (sound) {
        sound.stopAsync().catch(() => {});
        sound.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
    };
  }, []);

  return { stop };
}
