import { cp, mkdir, rm } from 'node:fs/promises';
import { build } from 'esbuild';
import { ensureVendorAssets } from './vendor-assets.mjs';
import {buildCalendar} from './build-calendar.mjs';

await ensureVendorAssets();
await buildCalendar();
await rm('dist', { recursive:true, force:true });
await mkdir('dist/server', { recursive:true });
await mkdir('dist/.openai', { recursive:true });
await cp('public', 'dist/client', { recursive:true });
await build({entryPoints:['worker/index.mjs'],outfile:'dist/server/index.js',bundle:true,format:'esm',platform:'browser',target:'es2022'});
await cp('.openai/hosting.json', 'dist/.openai/hosting.json');
