import { Platform } from 'react-native';

type SoundType =
  | 'sonarPing'
  | 'torpedoFire'
  | 'explosion'
  | 'alarmStart'
  | 'alarmStop'
  | 'hullDamage'
  | 'contact'
  | 'kill'
  | 'click'
  | 'buttonPress'
  | 'missionStart'
  | 'abyssalPulse';

let audioCtx: AudioContext | null = null;
let alarmOscillators: OscillatorNode[] = [];

/**
 * Looped sounds — keyed by tone name. Each entry has a `stop` callback that
 * cleans up oscillators and any scheduling intervals. Used by sounds that
 * need to play continuously until explicitly stopped (e.g. abyssalPulse
 * during MT0 step 8 — runs until the step ends).
 */
const loopedSounds: Map<string, { stop: () => void }> = new Map();

function getCtx(): AudioContext | null {
  if (Platform.OS !== 'web') return null;
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  return audioCtx;
}

export function playSound(type: SoundType | string, _opts?: { loop?: boolean }) {
  if (Platform.OS !== 'web') return;
  const ctx = getCtx();
  if (!ctx) return;

  try {
    switch (type) {
      case 'sonarPing': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(900, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 1.8);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.8);
        osc.start();
        osc.stop(ctx.currentTime + 1.8);

        const delay = ctx.createDelay();
        delay.delayTime.value = 0.4;
        const echoGain = ctx.createGain();
        echoGain.gain.value = 0.15;
        osc.connect(delay);
        delay.connect(echoGain);
        echoGain.connect(ctx.destination);
        break;
      }

      case 'torpedoFire': {
        const bufferSize = ctx.sampleRate * 0.3;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
        }
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 200;
        source.connect(filter);
        filter.connect(ctx.destination);
        source.start();
        break;
      }

      case 'explosion': {
        const bufferSize = ctx.sampleRate * 1.5;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.25));
        }
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 120;
        const gain = ctx.createGain();
        gain.gain.value = 0.8;
        source.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        source.start();
        break;
      }

      case 'alarmStart': {
        if (alarmOscillators.length > 0) return;
        for (let i = 0; i < 2; i++) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'square';
          osc.connect(gain);
          gain.connect(ctx.destination);
          gain.gain.value = 0.08;
          const freq1 = 440;
          const freq2 = 880;
          osc.frequency.setValueAtTime(i === 0 ? freq1 : freq2, ctx.currentTime);
          const toggleInterval = setInterval(() => {
            if (!alarmOscillators.includes(osc)) {
              clearInterval(toggleInterval);
              return;
            }
            const t = ctx.currentTime;
            osc.frequency.setValueAtTime(i === 0 ? freq2 : freq1, t);
            osc.frequency.setValueAtTime(i === 0 ? freq1 : freq2, t + 0.5);
          }, 1000);
          osc.start();
          alarmOscillators.push(osc);
        }
        break;
      }

      case 'alarmStop': {
        alarmOscillators.forEach((osc) => {
          try { osc.stop(); } catch {}
        });
        alarmOscillators = [];
        break;
      }

      case 'hullDamage': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(80, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.4);
        gain.gain.setValueAtTime(0.4, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.4);
        break;
      }

      case 'contact': {
        for (let i = 0; i < 2; i++) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.frequency.value = 600 + i * 200;
          gain.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.15);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.2);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(ctx.currentTime + i * 0.15);
          osc.stop(ctx.currentTime + i * 0.15 + 0.2);
        }
        break;
      }

      case 'kill': {
        const freqs = [400, 600, 800, 1000, 1200];
        freqs.forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.08 + 0.15);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(ctx.currentTime + i * 0.08);
          osc.stop(ctx.currentTime + i * 0.08 + 0.15);
        });
        break;
      }

      case 'click':
      case 'buttonPress': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = 1200;
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.05);
        break;
      }

      case 'missionStart': {
        // Short rising heroic tone — plays when M01 begins after MT0 hands off.
        // Two-layer: triangle base + sine harmonic for richness.
        const now = ctx.currentTime;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.6);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.25, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.75);

        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(440, now);
        osc2.frequency.exponentialRampToValueAtTime(1760, now + 0.6);
        gain2.gain.setValueAtTime(0, now);
        gain2.gain.linearRampToValueAtTime(0.12, now + 0.05);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now);
        osc2.stop(now + 0.75);
        break;
      }

      case 'abyssalPulse': {
        // Looped low-frequency pulse — atmospheric, ominous. Fires from MT0
        // step 8 side effect and runs until that step completes (server
        // sends STOP_TONE which calls stopSound('abyssalPulse')).
        // Pattern: 40hz sine, gain envelope cycles every 3 seconds:
        //   fade in 1.0s → hold 0.5s → fade out 1.5s → silence (loop)
        if (loopedSounds.has('abyssalPulse')) return; // already playing

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 40;
        gain.gain.value = 0;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();

        const schedulePulse = () => {
          if (!ctx) return;
          const now = ctx.currentTime;
          gain.gain.cancelScheduledValues(now);
          gain.gain.setValueAtTime(0, now);
          gain.gain.linearRampToValueAtTime(0.5, now + 1.0);
          gain.gain.setValueAtTime(0.5, now + 1.5);
          gain.gain.linearRampToValueAtTime(0, now + 3.0);
        };
        schedulePulse();
        const interval = setInterval(schedulePulse, 3000);

        loopedSounds.set('abyssalPulse', {
          stop: () => {
            clearInterval(interval);
            try { gain.gain.cancelScheduledValues(ctx!.currentTime); } catch {}
            try { gain.gain.setValueAtTime(0, ctx!.currentTime); } catch {}
            try { osc.stop(); } catch {}
          },
        });
        break;
      }
    }
  } catch (e) {
  }
}

/**
 * Stop a looped sound by name. No-op if the sound is not currently playing.
 * Called by GameContext when a STOP_TONE message arrives from the server.
 */
export function stopSound(type: SoundType | string) {
  if (Platform.OS !== 'web') return;
  const entry = loopedSounds.get(type);
  if (!entry) return;
  try { entry.stop(); } catch {}
  loopedSounds.delete(type);
}
