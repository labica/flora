/** Stable looks for things that have a name: a file, a folder, a document, a user. */
import { SPECIES_NAMES } from './botany/species.ts';
import { hashString } from './core/rng.ts';
import type { FloraOptions } from './flora.ts';
import { PALETTES } from './palette.ts';
import type { PaletteName } from './palette.ts';
import { STYLE_NAMES } from './styles.ts';

/**
 * Options that are always the same for a key and differ between keys. Pass a parent folder as
 * `family` so that siblings share a style and palette and read as one garden.
 */
export function identity(key: string, family?: string): Pick<FloraOptions, 'seed' | 'style' | 'palette' | 'flowers'> {
  const h = hashString(key);
  const f = hashString(family ?? key);
  const names = Object.keys(PALETTES) as PaletteName[];
  const a = SPECIES_NAMES[h % SPECIES_NAMES.length]!;
  const b = SPECIES_NAMES[(h >>> 8) % SPECIES_NAMES.length]!;
  return { seed: key, style: STYLE_NAMES[f % STYLE_NAMES.length]!, palette: names[(f >>> 8) % names.length]!, flowers: [a, b] };
}
