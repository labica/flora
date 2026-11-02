/** A contact sheet: each style in its own space, for checking by eye. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { flora } from '../src/flora.ts';
import type { FloraOptions } from '../src/flora.ts';

const set: [NonNullable<FloraOptions['style']>, NonNullable<FloraOptions['composition']>, number, number][] = [
  ['delft', 'panel', 420, 520], ['morris', 'tile', 420, 420], ['minhwa', 'bouquet', 420, 520], ['najeon', 'wreath', 420, 420],
  ['illuminated', 'frame', 420, 520], ['cathedral', 'arch', 420, 520], ['cloisonne', 'rosette', 420, 420], ['herbarium', 'specimen', 420, 520],
  ['sampler', 'corner', 420, 420], ['paperGarden', 'band', 840, 200], ['nightGarden', 'panel', 420, 420], ['ukiyo', 'marginRight', 420, 520], ['sketch', 'header', 840, 200],
];
let html = '<!doctype html><body style="margin:12px;background:#ddd;display:flex;flex-wrap:wrap;align-items:flex-start;gap:10px;width:1740px">';
let total = 0;
for (const [style, composition, width, height] of set) {
  const t = performance.now();
  const art = flora({ width, height, seed: process.argv[2] ?? 11, style, composition });
  const svg = art.toSVG();
  total += svg.length;
  console.log(style, composition, `${(performance.now() - t).toFixed(0)}ms`, `${(svg.length / 1e3).toFixed(0)}KB`, art.stats.blooms);
  html += `<figure style="margin:0;background:#fff"><figcaption style="font:12px sans-serif">${style} / ${composition}</figcaption>${svg}</figure>`;
}
mkdirSync('demo/out', { recursive: true });
writeFileSync('demo/out/contact.html', html);
console.log(`total ${(total / 1e6).toFixed(1)}MB`);
