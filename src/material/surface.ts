/** What the ornament sits on. Use `transparent` to let the host app show through. */
import type { Surface } from './types.ts';

export const SURFACES = {
  transparent: { name: 'transparent', background: null, base: '#ffffff' },
  paper: { name: 'paper', background: '#fdfcf7', base: '#fdfcf7' },
  ivory: { name: 'ivory', background: '#f5efe0', base: '#f5efe0' },
  cream: { name: 'cream', background: '#f3e8d2', base: '#f3e8d2' },
  linen: { name: 'linen', background: '#e9e2d3', base: '#e9e2d3' },
  celadon: {
    name: 'celadon',
    background: { type: 'linear', from: [0, 0], to: [0, 900], stops: [{ at: 0, color: '#c0cfbd' }, { at: 1, color: '#a3b8a9' }] },
    base: '#b3c5b4',
  },
  ink: { name: 'ink', background: '#10233f', base: '#10233f' },
  night: { name: 'night', background: '#0b0d18', base: '#0b0d18' },
  lacquer: {
    name: 'lacquer',
    background: { type: 'linear', from: [0, 0], to: [0, 900], stops: [{ at: 0, color: '#1b0f12' }, { at: 1, color: '#0a0608' }] },
    base: '#120a0c',
  },
} as const satisfies Record<string, Surface>;

export type SurfaceName = keyof typeof SURFACES;
export type SurfaceRef = SurfaceName | Surface;

export function resolveSurface(s: SurfaceRef): Surface {
  if (typeof s !== 'string') return s;
  const found = SURFACES[s];
  if (!found) throw new Error(`flora: unknown surface "${s}". Known: ${Object.keys(SURFACES).join(', ')}`);
  return found;
}
