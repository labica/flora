/**
 * <flora-art> fills its box and regrows when resized. Import once for the side effect.
 *   <flora-art seed="docs/intro.md" flora-style="delft" composition="margin"></flora-art>
 * Children marked [data-flora-keep] are kept clear of ornament. With data-flora-keep="lines" the
 * ornament follows the text itself, moving into the space beside short lines.
 */
import { flora } from './flora.ts';
import type { FloraOptions } from './flora.ts';
import { lineBoxes } from './grow/lines.ts';
import type { Box } from './grow/region.ts';
import { drawScene } from './scene/canvas.ts';
import type { Scene } from './scene/types.ts';

const ATTRS = ['seed', 'flora-style', 'composition', 'material', 'palette', 'surface', 'density', 'animate'] as const;

export class FloraElement extends HTMLElement {
  static observedAttributes = [...ATTRS];
  private canvas = document.createElement('canvas');
  private observer?: ResizeObserver;
  private timer = 0;
  private raf = 0;

  connectedCallback(): void {
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    root.innerHTML = '<style>:host{display:block;position:relative}canvas{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}</style><slot></slot>';
    root.prepend(this.canvas);
    this.observer = new ResizeObserver(() => this.schedule());
    this.observer.observe(this);
    // Web fonts change where lines break.
    void document.fonts?.ready.then(() => {
      if (this.isConnected) this.schedule();
    });
  }

  disconnectedCallback(): void {
    this.observer?.disconnect();
    cancelAnimationFrame(this.raf);
    clearTimeout(this.timer);
  }

  attributeChangedCallback(): void {
    if (this.isConnected) this.schedule();
  }

  private schedule(): void {
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.render(), 120);
  }

  private keepBoxes(): Box[] {
    const host = this.getBoundingClientRect();
    const box = (r: DOMRect): Box => ({ x: r.left - host.left, y: r.top - host.top, width: r.width, height: r.height });
    return [...this.querySelectorAll('[data-flora-keep]')].flatMap((el) => {
      if (el.getAttribute('data-flora-keep') !== 'lines') return [box(el.getBoundingClientRect())];
      // Text nodes only: a range over elements also reports their full block boxes.
      const rects: Box[] = [];
      const range = document.createRange();
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        if (!walker.currentNode.nodeValue?.trim()) continue;
        range.selectNodeContents(walker.currentNode);
        rects.push(...[...range.getClientRects()].map(box));
      }
      const lines = lineBoxes(rects);
      return lines.length ? lines : [box(el.getBoundingClientRect())];
    });
  }

  private render(): void {
    const width = Math.round(this.clientWidth);
    const height = Math.round(this.clientHeight);
    if (width < 8 || height < 8) return;
    const opt = (name: (typeof ATTRS)[number]): string | undefined => this.getAttribute(name) ?? undefined;
    const art = flora({
      width,
      height,
      seed: opt('seed') ?? 1,
      style: opt('flora-style') as FloraOptions['style'],
      composition: opt('composition') as FloraOptions['composition'],
      material: opt('material') as FloraOptions['material'],
      palette: opt('palette'),
      surface: opt('surface') as FloraOptions['surface'],
      density: opt('density') ? Number(opt('density')) : undefined,
      exclude: this.keepBoxes(),
    });
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    cancelAnimationFrame(this.raf);
    const paint = (scene: Scene): void => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      drawScene(ctx, scene);
    };
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!this.hasAttribute('animate') || reduced) {
      paint(art.scene);
      return;
    }
    const start = performance.now();
    const step = (now: number): void => {
      const p = (now - start) / 5000;
      paint(art.frame(p));
      if (p < 1) this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }
}

if (!customElements.get('flora-art')) customElements.define('flora-art', FloraElement);
