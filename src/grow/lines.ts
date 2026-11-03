/** Turns the rectangles a browser reports for flowing text into one keep-out box per line. */
import type { Box } from './region.ts';

/**
 * Pieces that share a line merge, and each line reaches down to the next one so nothing can grow
 * in the gap between lines. Paragraph breaks taller than a line stay open.
 */
export function lineBoxes(rects: readonly Box[]): Box[] {
  const lines: Box[] = [];
  const sorted = rects.filter((r) => r.width > 0 && r.height > 0).sort((a, b) => a.y + a.height / 2 - (b.y + b.height / 2));
  for (const r of sorted) {
    const last = lines[lines.length - 1];
    if (last && r.y + r.height / 2 < last.y + last.height) {
      const left = Math.min(last.x, r.x);
      const right = Math.max(last.x + last.width, r.x + r.width);
      const top = Math.min(last.y, r.y);
      const bottom = Math.max(last.y + last.height, r.y + r.height);
      lines[lines.length - 1] = { x: left, y: top, width: right - left, height: bottom - top };
    } else {
      lines.push({ ...r });
    }
  }
  return lines.map((line, i) => {
    const next = lines[i + 1];
    const gap = next ? next.y - (line.y + line.height) : Infinity;
    return gap > 0 && gap <= line.height ? { ...line, height: line.height + gap } : line;
  });
}
