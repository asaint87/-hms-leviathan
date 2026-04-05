export const Colors = {
  bg: '#060a0d',
  bgCard: 'rgba(4,14,22,0.95)',
  bgCard2: '#060e18',
  bgCard3: '#0a1520',
  amber: '#ffb300',
  amber2: '#ff8c00',
  teal: '#00e0ff',
  green: '#00ff88',
  green2: '#00cc66',
  red: '#ff3030',
  red2: '#cc0000',
  blue: '#00cfff',
  orange: '#ff8c00',
  border: 'rgba(255,179,0,0.15)',
  border2: 'rgba(255,179,0,0.3)',
  textDim: '#555',
  text: '#cccccc',
  white: '#ffffff',

  roles: {
    c: { primary: '#ffb300', dim: '#7a5500', bg: 'rgba(255,179,0,0.10)' },
    n: { primary: '#00cfff', dim: '#004466', bg: 'rgba(0,207,255,0.10)' },
    s: { primary: '#00e0ff', dim: '#005566', bg: 'rgba(0,224,255,0.10)' },
    e: { primary: '#ff8c00', dim: '#552e00', bg: 'rgba(255,140,0,0.10)' },
    w: { primary: '#ff3030', dim: '#550000', bg: 'rgba(255,48,48,0.10)' },
  },
} as const;

export type RoleKey = 'c' | 'n' | 's' | 'e' | 'w';
