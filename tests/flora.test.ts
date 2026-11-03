import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MATERIAL_NAMES, SPECIES, SPECIES_NAMES, STYLE_NAMES, drawScene, flora, hybrid, identity, lineBoxes, rect, svgDataURL } from '../src/index.ts';
import type { CompositionName, Ctx2D, DrawOp } from '../src/index.ts';
import { buildFlower } from '../src/botany/flower.ts';
import { oklchToRgb, parseHex, rampOf, rgbToOklch } from '../src/core/color.ts';
import { bounds } from '../src/core/geom.ts';
import type { Pt } from '../src/core/geom.ts';
import { Rng } from '../src/core/rng.ts';
import { Field } from '../src/grow/field.ts';
import { pathData, simplify } from '../src/scene/svg.ts';
import { line, poly } from '../src/scene/types.ts';

const COMPOSITIONS: CompositionName[] = ['panel', 'margin', 'marginRight', 'corner', 'frame', 'header', 'footer', 'band', 'wreath', 'rosette', 'tile', 'arch', 'bouquet', 'specimen', 'scatter', 'emblem'];

function pointsOf(ops: readonly DrawOp[], out: Pt[] = []): Pt[] {
  for (const o of ops) {
    if (o.op === 'group') pointsOf(o.ops, out);
    else for (const s of o.subs) out.push(...s.pts);
  }
  return out;
}

/** Visible outer geometry: clipped groups cannot paint outside their parent shape. */
function outerPoints(ops: readonly DrawOp[], out: Pt[] = []): Pt[] {
  for (const o of ops) {
    if (o.op === 'group') {
      if (!o.clip) outerPoints(o.ops, out);
    } else for (const s of o.subs) out.push(...s.pts);
  }
  return out;
}

test('the same options give identical output', () => {
  const a = flora({ width: 300, height: 300, seed: 'a/b.md', style: 'delft' }).toSVG();
  const b = flora({ width: 300, height: 300, seed: 'a/b.md', style: 'delft' }).toSVG();
  assert.equal(a, b);
});

test('undefined options keep the style defaults', () => {
  const a = flora({ width: 200, height: 200, seed: 1, style: 'delft' }).toSVG();
  const b = flora({ width: 200, height: 200, seed: 1, style: 'delft', palette: undefined, material: undefined, surface: undefined }).toSVG();
  assert.equal(a, b);
});

test('different seeds differ', () => {
  assert.notEqual(flora({ width: 300, height: 300, seed: 1 }).toSVG(), flora({ width: 300, height: 300, seed: 2 }).toSVG());
});

for (const composition of COMPOSITIONS) {
  test(`composition ${composition} grows`, () => {
    for (const seed of [1, 2, 3]) {
      const art = flora({ width: 400, height: 400, seed, composition });
      assert.ok(art.stats.blooms > 0, `seed ${seed} has blooms`);
      assert.ok(pointsOf(art.scene.ops).every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)));
    }
  });
}

for (const material of MATERIAL_NAMES) {
  test(`material ${material} paints`, () => {
    const svg = flora({ width: 200, height: 200, material, seed: 4 }).toSVG();
    assert.ok(svg.includes('<path'));
    assert.ok(!svg.includes('NaN'));
  });
}

for (const style of STYLE_NAMES) {
  test(`style ${style} resolves`, () => assert.ok(flora({ width: 240, height: 240, style, seed: 5 }).stats.elements > 0));
}

test('every species builds at every tilt without NaN', () => {
  for (const n of SPECIES_NAMES) {
    for (const t of [0, 45, 80]) {
      const f = buildFlower(SPECIES[n], new Rng(n), [100, 100], 50, -1.5, t, 0);
      assert.ok(f.parts.length > 0, n);
      assert.ok(f.parts.flatMap((p) => p.outline).every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)), n);
    }
  }
});

test('ornament stays clear of excluded text', () => {
  const box = { x: 320, y: 40, width: 440, height: 720 };
  for (const seed of [1, 2, 3, 4, 5]) {
    const art = flora({ width: 800, height: 800, seed, composition: 'panel', exclude: [box], padding: 16 });
    const inside = outerPoints(art.scene.ops).filter(([x, y]) => x > box.x && x < box.x + box.width && y > box.y && y < box.y + box.height);
    assert.equal(inside.length, 0, `seed ${seed}: ${inside.length} points inside the keep-out`);
  }
});

test('ids differ between same-seed ornaments so they can share a page', () => {
  const id = (s: string): string | undefined => s.match(/id="([a-z0-9]+-)/)?.[1];
  const a = flora({ width: 200, height: 200, seed: 1, style: 'delft' }).toSVG();
  const b = flora({ width: 200, height: 200, seed: 1, style: 'sampler' }).toSVG();
  assert.ok(id(a) && id(b));
  assert.notEqual(id(a), id(b));
});

test('a tile repeats what crosses its edges', () => {
  const W = 300;
  const art = flora({ width: W, height: W, seed: 3, composition: 'tile', material: 'gouache' });
  const pts = outerPoints(art.scene.ops);
  assert.ok(pts.some(([x]) => x < 0) && pts.some(([x]) => x > W));
  assert.ok(pts.some(([, y]) => y < 0) && pts.some(([, y]) => y > W));
});

test('ornament follows short lines of text', () => {
  const pad = 8;
  const text = lineBoxes([
    { x: 300, y: 60, width: 460, height: 24 },
    { x: 300, y: 88, width: 460, height: 24 },
    { x: 300, y: 116, width: 150, height: 24 },
    { x: 300, y: 144, width: 130, height: 24 },
    { x: 300, y: 172, width: 160, height: 24 },
    { x: 300, y: 200, width: 120, height: 24 },
    { x: 300, y: 228, width: 150, height: 24 },
    { x: 300, y: 256, width: 140, height: 24 },
    { x: 300, y: 284, width: 460, height: 24 },
  ]);
  let beside = 0;
  for (const seed of [1, 2, 3, 4, 5]) {
    const art = flora({ width: 800, height: 800, seed, composition: 'panel', exclude: text, padding: pad });
    const pts = outerPoints(art.scene.ops);
    for (const b of text) {
      const inside = pts.filter(([x, y]) => x > b.x && x < b.x + b.width && y > b.y && y < b.y + b.height);
      assert.equal(inside.length, 0, `seed ${seed}: ${inside.length} points on the text`);
    }
    beside += pts.filter(([x, y]) => x > 470 && x < 760 && y > 120 && y < 280).length;
  }
  assert.ok(beside > 0, 'the space beside a run of short lines gets used');
});

test('line boxes merge pieces and close the gaps between lines', () => {
  const lines = lineBoxes([
    { x: 10, y: 0, width: 40, height: 20 },
    { x: 60, y: 2, width: 30, height: 16 },
    { x: 10, y: 24, width: 30, height: 20 },
    { x: 10, y: 90, width: 30, height: 20 },
    { x: 10, y: 200, width: 0, height: 20 },
  ]);
  assert.equal(lines.length, 3);
  assert.deepEqual(lines[0], { x: 10, y: 0, width: 80, height: 24 });
  assert.equal(lines[1]!.height, 20, 'a paragraph break stays open');
});

test('svg output shares repeats and keeps fine tips', () => {
  const svg = flora({ width: 300, height: 300, seed: 3, style: 'delft' }).toSVG();
  assert.ok(svg.includes('<use href="#'));
  assert.ok(/href="#[^"]+" x1=/.test(svg), 'gradients share their stops');
  const curve = pathData([poly([[0, 0], [10, 0], [20, 5], [30, 5], [40, 0]])]);
  assert.ok(curve.includes('s') && curve.includes('c'));
  const tip: [number, number][] = [[0, 0], [10, 0.01], [20, 0.02], [30, 0.01], [31, 0], [30, -0.01], [20, -0.02], [10, -0.01]];
  assert.ok(simplify(tip, true, 0.1, true).some(([x]) => x === 31), 'the tip stays');
  assert.equal(simplify(line([[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]]).pts, false, 0.1).length, 2);
});

test('smoothing tolerance trades size for accuracy', () => {
  const art = flora({ width: 300, height: 300, seed: 3, style: 'morris' });
  assert.ok(art.toSVG({ tolerance: 0.5 }).length < art.toSVG().length);
  assert.ok(art.toSVG().length < art.toSVG({ tolerance: 0 }).length);
});

test('data urls decode back to the same picture', () => {
  const svg = flora({ width: 88, height: 88, seed: 'x', composition: 'emblem', style: 'delft' }).toSVG({ title: 'x' });
  const url = svgDataURL(svg);
  assert.ok(!/[<>#%](?![0-9A-F]{2})/.test(url.slice(19)));
  assert.equal(decodeURIComponent(url.slice(19)), svg.replace(/"/g, "'"));
  assert.ok(url.length < encodeURIComponent(svg).length * 0.8);
});

test('a bouquet on a tall page reaches the top third', () => {
  const H = 520;
  for (const seed of [1, 2, 3, 11]) {
    const art = flora({ width: 420, height: H, seed, composition: 'bouquet', style: 'minhwa' });
    const [, y0] = bounds(outerPoints(art.scene.ops));
    assert.ok(y0 < H / 3, `seed ${seed}: top at ${y0}`);
  }
});

test('growth frames run from empty to complete', () => {
  const art = flora({ width: 240, height: 240, seed: 2 });
  assert.equal(art.frame(0).ops.length, 0);
  const late = art.frame(1);
  assert.equal(late.ops.length, art.scene.ops.length);
  assert.ok(art.frame(0.4).ops.length < late.ops.length);
});

test('canvas renderer balances save and restore', () => {
  let depth = 0;
  let calls = 0;
  const ctx = new Proxy(
    {},
    {
      get(_t, k) {
        if (k === 'save') return () => depth++;
        if (k === 'restore') return () => depth--;
        if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
        return () => void calls++;
      },
      set: () => true,
    },
  ) as unknown as Ctx2D;
  drawScene(ctx, flora({ width: 200, height: 200, seed: 1 }).scene);
  assert.equal(depth, 0);
  assert.ok(calls > 100);
});

test('identity is stable and siblings share a family', () => {
  assert.deepEqual(identity('a'), identity('a'));
  assert.equal(identity('x', 'folder').palette, identity('y', 'folder').palette);
});

test('hybrid species build', () => {
  const s = hybrid('rose', 'lily');
  assert.ok(buildFlower(s, new Rng(1), [0, 0], 30, 0, 20, 0).parts.length);
});

test('field finds the largest circle in a rectangle', () => {
  const f = new Field(rect(0, 0, 100, 40), 2);
  f.reach.fill(0);
  const c = f.largest(1, []);
  assert.ok(c);
  assert.ok(Math.abs(c.r - 20) <= 2.5, `r=${c.r}`);
  f.stampDisc(c.x, c.y, 10, 1);
  assert.ok(f.at(c.x, c.y) < 0);
});

test('colour round trip', () => {
  const c = parseHex('#2456c4');
  const [L, C, h] = rgbToOklch(c);
  const r = oklchToRgb(L, C, h);
  c.forEach((v, i) => assert.ok(Math.abs(v - r[i]!) < 0.01));
  const ramp = rampOf('#2456c4');
  assert.ok(rgbToOklch(parseHex(ramp(0)))[0] < rgbToOklch(parseHex(ramp(1)))[0]);
});

test('bad options fail with a clear message', () => {
  assert.throws(() => flora({ width: 10, height: 10, palette: 'nope' }), /unknown palette/);
  assert.throws(() => flora({ width: 0, height: 10 }), /positive/);
  assert.throws(() => flora({ width: 10, height: 10, flowers: ['nope' as never] }), /unknown species/);
});

test('icons stay small and inside their box', () => {
  const art = flora({ width: 48, height: 48, seed: 'x', composition: 'emblem', style: 'delft' });
  const size = art.toSVG().length;
  assert.ok(size < 120_000, `${size} bytes`);
  const [x0, y0, x1, y1] = bounds(outerPoints(art.scene.ops));
  assert.ok(x0 > -6 && y0 > -6 && x1 < 54 && y1 < 54, `${x0} ${y0} ${x1} ${y1}`);
});
