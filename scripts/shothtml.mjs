// Screenshots an HTML file with headless Chrome: node scripts/shothtml.mjs in.html out.png W H
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [input, output, w, h] = process.argv.slice(2);
const dir = mkdtempSync(join(tmpdir(), 'flora-'));
const chrome = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
execFileSync(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--user-data-dir=${join(dir, 'u')}`, `--window-size=${w},${h}`, '--virtual-time-budget=20000', `--screenshot=${resolve(output)}`, pathToFileURL(resolve(input)).href], { stdio: 'ignore', timeout: 120000 });
rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
