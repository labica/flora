/** A species sheet for checking flower shapes by eye. Writes demo/out/species.svg. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildFlower } from '../src/botany/flower.ts';
import { SPECIES, SPECIES_NAMES } from '../src/botany/species.ts';
import { Rng } from '../src/core/rng.ts';
import { MATERIALS } from '../src/material/materials.ts';
import type { MaterialName } from '../src/material/materials.ts';
import { SURFACES } from '../src/material/surface.ts';
import { PALETTES, inks } from '../src/palette.ts';
import type { PaletteName } from '../src/palette.ts';
import { toSVG } from '../src/scene/svg.ts';
import type { DrawOp } from '../src/scene/types.ts';

const name = (process.argv[2] ?? 'watercolor') as MaterialName;
const paletteName = (process.argv[3] ?? 'garden') as PaletteName;
const mat = MATERIALS[name];
const surface = SURFACES[mat.surface as keyof typeof SURFACES];
const cols = 6;
const cell = 200;
const rows = Math.ceil(SPECIES_NAMES.length / cols) * 2;
const ops: DrawOp[] = [];
const ink = inks(PALETTES[paletteName]);
SPECIES_NAMES.forEach((n, i) => {
  const s = SPECIES[n];
  for (let v = 0; v < 2; v++) {
    const x = (i % cols) * cell + cell / 2;
    const y = (Math.floor(i / cols) * 2 + v) * cell + cell / 2;
    const rng = new Rng(`${n}${v}`);
    const tilt = v === 0 ? s.tilt[0] : s.tilt[1];
    const f = buildFlower(s, rng, [x, y], 74, -Math.PI / 2 + (v ? 0.3 : 0), tilt, i);
    const ctx = { rng: rng.fork('p'), inks: ink, detail: 1, surface: surface.base };
    for (const p of f.parts) ops.push(...mat.paint(p, ctx));
  }
});
mkdirSync('demo/out', { recursive: true });
writeFileSync(`demo/out/species-${name}.svg`, toSVG({ width: cols * cell, height: rows * cell, background: surface.background, ops }));
