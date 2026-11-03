/** Output sizes per look, raw and gzipped: node --experimental-strip-types scripts/size.ts [outDir] [tolerance] */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { STYLE_NAMES, flora } from '../src/index.ts';
import type { Art } from '../src/index.ts';

const outDir = process.argv[2];
const tolerance = process.argv[3] === undefined ? undefined : Number(process.argv[3]);
if (outDir) mkdirSync(outDir, { recursive: true });
const kb = (n: number): string => (n / 1e3).toFixed(0).padStart(7);
let raw = 0;
let zip = 0;
let url = 0;
const measure = (name: string, art: Art): void => {
  const svg = art.toSVG(tolerance === undefined ? {} : { tolerance });
  const gz = gzipSync(svg).length;
  const data = art.toDataURL(tolerance === undefined ? {} : { tolerance }).length;
  raw += svg.length;
  zip += gz;
  url += data;
  console.log(name.padEnd(22), kb(svg.length), kb(gz), kb(data));
  if (outDir) writeFileSync(join(outDir, `${name}.svg`), svg);
};
console.log('look'.padEnd(22), '    raw', '   gzip', 'dataURL', '(KB)');
for (const style of STYLE_NAMES) measure(style, flora({ width: 640, height: 760, seed: 7, style }));
measure('emblem', flora({ width: 88, height: 88, seed: 'docs/intro.md', style: 'delft', composition: 'emblem', surface: 'transparent' }));
console.log('total'.padEnd(22), kb(raw), kb(zip), kb(url));
