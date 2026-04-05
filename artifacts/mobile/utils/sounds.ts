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
  | 'buttonPress';

let audioCtx: AudioContext | null = null;
let alarmOscillators: OscillatorNode[] = [];

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

export function playSound(type: SoundType) {
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
    }
  } catch (e) {
  }
}
