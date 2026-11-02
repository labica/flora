/** Renders test pieces to demo/out as SVG. Usage: gallery.ts style composition W H seed [out] */
import { mkdirSync, writeFileSync } from 'node:fs';
import { flora } from '../src/flora.ts';
import type { FloraOptions } from '../src/flora.ts';

const [style = 'delft', composition = 'panel', w = '800', h = '1000', seed = '7', out] = process.argv.slice(2);
mkdirSync('demo/out', { recursive: true });
const t = performance.now();
const art = flora({ width: +w, height: +h, seed, style: style as FloraOptions['style'], composition: composition as FloraOptions['composition'] });
const t1 = performance.now();
const svg = art.toSVG();
const file = `demo/out/${out ?? `${style}-${composition}-${seed}`}.svg`;
writeFileSync(file, svg);
console.log(file, art.stats, `grow+paint ${(t1 - t).toFixed(0)}ms`, `${(svg.length / 1e6).toFixed(2)}MB`);
