import { MATERIAL_NAMES, PALETTES, SPECIES, SPECIES_NAMES, STYLE_NAMES, SURFACES, drawScene, flora, identity } from '../src/index.ts';
import type { Art, CompositionName, FloraOptions, MaterialName, PaletteName, StyleName, SurfaceName } from '../src/index.ts';
import '../src/element.ts';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const COMPOSITIONS: CompositionName[] = ['panel', 'margin', 'marginRight', 'corner', 'frame', 'header', 'footer', 'band', 'wreath', 'rosette', 'tile', 'arch', 'bouquet', 'specimen', 'scatter', 'emblem'];

function fill(id: string, items: readonly string[], value: string, blank?: string): void {
  const el = $<HTMLSelectElement>(id);
  el.innerHTML = (blank ? `<option value="">${blank}</option>` : '') + items.map((v) => `<option>${v}</option>`).join('');
  el.value = value;
}
fill('style', STYLE_NAMES, 'delft');
fill('composition', COMPOSITIONS, 'panel');
fill('material', MATERIAL_NAMES, '', '(스타일 기본)');
fill('palette', Object.keys(PALETTES), '', '(스타일 기본)');
fill('surface', Object.keys(SURFACES), '', '(재질 기본)');
fill('flower', SPECIES_NAMES.map((n) => n), '', '(스타일 기본)');

const stage = $<HTMLCanvasElement>('stage');
let art: Art | null = null;
let raf = 0;

function paint(scene: Art['scene']): void {
  const ctx = stage.getContext('2d')!;
  const dpr = devicePixelRatio || 1;
  stage.width = scene.width * dpr;
  stage.height = scene.height * dpr;
  stage.style.width = `${scene.width}px`;
  stage.style.height = `${scene.height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, scene.width, scene.height);
  drawScene(ctx, scene);
}

function value<T>(id: string): T | undefined {
  const v = $<HTMLSelectElement>(id).value;
  return v ? (v as T) : undefined;
}

function render(): void {
  cancelAnimationFrame(raf);
  const flower = value<keyof typeof SPECIES>('flower');
  const opts: FloraOptions = {
    width: Number($<HTMLInputElement>('w').value),
    height: Number($<HTMLInputElement>('h').value),
    seed: $<HTMLInputElement>('seed').value,
    style: value<StyleName>('style'),
    composition: value<CompositionName>('composition'),
    material: value<MaterialName>('material'),
    palette: value<PaletteName>('palette'),
    surface: value<SurfaceName>('surface'),
    density: Number($<HTMLInputElement>('density').value),
  };
  if (flower) opts.flowers = [flower];
  if ($<HTMLInputElement>('invent').checked) opts.flowers = 'invent';
  const t = performance.now();
  art = flora(opts);
  paint(art.scene);
  $('info').textContent = `${(performance.now() - t).toFixed(0)}ms · 꽃 ${art.stats.blooms} · 요소 ${art.stats.elements} · 그리기 ${art.stats.ops}`;
}

for (const id of ['style', 'composition', 'material', 'palette', 'surface', 'flower', 'seed', 'w', 'h', 'density', 'invent']) $(id).addEventListener('change', render);
$('shuffle').addEventListener('click', () => {
  $<HTMLInputElement>('seed').value = Math.random().toString(36).slice(2, 8);
  render();
});
$('grow').addEventListener('click', () => {
  if (!art) return;
  const a = art;
  const start = performance.now();
  const step = (now: number): void => {
    const p = (now - start) / 5000;
    paint(a.frame(p));
    if (p < 1) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
});
$('save').addEventListener('click', () => {
  if (!art) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([art.toSVG()], { type: 'image/svg+xml' }));
  a.download = `flora-${$<HTMLInputElement>('seed').value}.svg`;
  a.click();
});

// Explorer: each entry derives its look from its path; siblings share a family.
const tree: [string, string[]][] = [
  ['docs', ['intro.md', 'guide.md', 'api.md', 'faq.md', 'changes.md', 'roadmap.md']],
  ['photos/2026', ['spring.jpg', 'jeju.jpg', 'family.jpg', 'garden.jpg', 'hanok.jpg', 'sea.jpg']],
  ['projects', ['flora', 'milkmind', 'ghostline', 'winzy', 'notes', 'site']],
];
const explorer = $('explorer');
for (const [folder, files] of tree) {
  const h = document.createElement('h3');
  h.textContent = folder;
  explorer.append(h);
  const row = document.createElement('div');
  row.className = 'row';
  for (const f of files) {
    const path = `${folder}/${f}`;
    const art2 = flora({ ...identity(path, folder), width: 88, height: 88, composition: 'emblem', surface: 'transparent' });
    const item = document.createElement('figure');
    const img = new Image(88, 88);
    img.src = art2.toDataURL();
    img.alt = '';
    const cap = document.createElement('figcaption');
    cap.textContent = f;
    item.append(img, cap);
    row.append(item);
  }
  explorer.append(row);
}

render();
