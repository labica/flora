/** Curated looks. A style is a set of default options; anything can still be overridden. */
import type { FloraOptions } from './flora.ts';

type StyleOptions = Pick<FloraOptions, 'flowers' | 'sprays' | 'material' | 'palette' | 'surface' | 'density' | 'sway'>;

export const STYLES = {
  /** The look of the reference page: one cobalt ink, tended margins. */
  delft: { material: 'watercolor', palette: 'cobalt', surface: 'paper', flowers: ['morningGlory', 'clematis', 'mugunghwa', 'gentian'], sprays: ['cyme', 'umbel', 'gypsophila'] },
  /** Arts and Crafts wallpaper: flat colour, dense foliage. */
  morris: { material: 'gouache', palette: 'morris', surface: 'linen', flowers: ['peony', 'poppy', 'anemone', 'tulip'], sprays: ['berries', 'fern'], density: 1.05 },
  /** 조선 민화: 모란과 매화. */
  minhwa: { material: 'gouache', palette: 'minhwa', surface: 'cream', flowers: ['peony', 'plumBlossom', 'lotus', 'chrysanthemum'], sprays: ['berries', 'hydrangea'], sway: 0.8 },
  /** 나전칠기: 자개 꽃을 옻칠 위에. */
  najeon: { material: 'najeon', palette: 'mono', surface: 'lacquer', flowers: ['peony', 'chrysanthemum', 'lotus', 'plumBlossom'], sprays: ['cyme', 'berries'], density: 0.75 },
  /** Illuminated manuscript gilding. */
  illuminated: { material: 'gilt', palette: 'rouge', surface: 'lacquer', flowers: ['rose', 'clematis', 'lily'], sprays: ['berries', 'fern'] },
  /** Cathedral window. */
  cathedral: { material: 'stainedGlass', palette: 'dusk', surface: 'night', flowers: ['lily', 'rose', 'clematis'], sprays: ['berries'], density: 0.9 },
  /** Enamel over gold wire. */
  cloisonne: { material: 'cloisonne', palette: 'jade', surface: 'ink', flowers: ['lotus', 'peony', 'chrysanthemum'], sprays: ['berries'] },
  /** A herbarium sheet in sepia ink. */
  herbarium: { material: 'engraving', palette: 'sepia', surface: 'ivory', flowers: ['anemone', 'poppy', 'daisy', 'bellflower'], sprays: ['umbel', 'wheat', 'fern'], density: 0.7 },
  /** Thread on linen. */
  sampler: { material: 'embroidery', palette: 'garden', surface: 'linen', flowers: ['daisy', 'cosmos', 'pansy', 'plumBlossom'], sprays: ['lavender', 'cyme'], density: 0.8 },
  /** Layered paper craft. */
  paperGarden: { material: 'papercut', palette: 'pastel', surface: 'cream', flowers: ['cosmos', 'tulip', 'plumBlossom', 'anemone'], sprays: ['lavender', 'berries'], density: 0.8 },
  /** Night signage. */
  nightGarden: { material: 'neon', palette: 'dusk', surface: 'night', flowers: ['lily', 'aster', 'cosmos'], sprays: ['umbel', 'cyme'], density: 0.6 },
  /** Woodblock print colours. */
  ukiyo: { material: 'gouache', palette: 'ukiyo', surface: 'ivory', flowers: ['cherryBlossom', 'chrysanthemum', 'morningGlory'], sprays: ['wisteria', 'fern'], density: 0.75 },
  /** Fine line only. */
  sketch: { material: 'ink', palette: 'mono', surface: 'paper', flowers: ['rose', 'poppy', 'cosmos', 'lily'], sprays: ['fern', 'umbel', 'gypsophila'], density: 0.75 },
} as const satisfies Record<string, StyleOptions>;

export type StyleName = keyof typeof STYLES;
export const STYLE_NAMES = Object.keys(STYLES) as StyleName[];
