/**
 * Canonical bearing math — used identically in Captain radar,
 * Sonar scope, and Strategic Map.
 * East = +x, North = -y (up on screen)
 */
export function bearingRangeToOffset(bearingDeg: number, rangeFrac: number) {
  const rad = (bearingDeg * Math.PI) / 180;
  return {
    x: Math.sin(rad) * rangeFrac,
    y: -Math.cos(rad) * rangeFrac,
  };
}

export function bearingLabel(deg: number): string {
  const d = Math.round(deg) % 360;
  return `${d < 10 ? '00' : d < 100 ? '0' : ''}${d}°`;
}

export function rangeKm(rangeFrac: number): number {
  return Math.round(rangeFrac * 60);
}

export function hitProbability(rangeFrac: number): number {
  return Math.max(45, Math.round((0.93 - rangeFrac * 0.65) * 100));
}
