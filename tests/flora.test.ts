import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MATERIAL_NAMES, SPECIES, SPECIES_NAMES, STYLE_NAMES, drawScene, flora, hybrid, identity, rect } from '../src/index.ts';
import type { CompositionName, Ctx2D, DrawOp } from '../src/index.ts';
import { buildFlower } from '../src/botany/flower.ts';
import { oklchToRgb, parseHex, rampOf, rgbToOklch } from '../src/core/color.ts';
import { bounds } from '../src/core/geom.ts';
import type { Pt } from '../src/core/geom.ts';
import { Rng } from '../src/core/rng.ts';
import { Field } from '../src/grow/field.ts';

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
