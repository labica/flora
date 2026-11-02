// Bundles the playground into demo/out; open demo/out/index.html directly.
import { copyFileSync, mkdirSync } from 'node:fs';
import { build } from 'esbuild';

mkdirSync('demo/out', { recursive: true });
await build({ entryPoints: ['demo/app.ts'], bundle: true, minify: true, format: 'iife', target: 'es2022', outfile: 'demo/out/app.js' });
copyFileSync('demo/index.html', 'demo/out/index.html');
console.log('demo/out/index.html');
