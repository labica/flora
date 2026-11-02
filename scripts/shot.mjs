// Rasterises an SVG with headless Chrome: node scripts/shot.mjs in.svg out.png [width height]
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const [input, output, w, h] = process.argv.slice(2);
const svg = readFileSync(input, 'utf8');
const m = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
const width = Number(w ?? m[1]);
const height = Number(h ?? m[2]);
const dir = mkdtempSync(join(tmpdir(), 'flora-'));
const html = join(dir, 'p.html');
writeFileSync(html, `<!doctype html><style>html,body{margin:0;background:#fff}svg{display:block;width:${width}px;height:${height}px}</style>${svg}`);
const chrome = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
execFileSync(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--user-data-dir=${join(dir, 'u')}`, `--window-size=${width},${height}`, `--screenshot=${resolve(output)}`, `file:///${html.replaceAll('\\', '/')}`], { stdio: 'ignore', timeout: 90000 });
rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
console.log(output, width, height);
