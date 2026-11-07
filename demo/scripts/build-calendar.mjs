import {build} from 'esbuild';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export async function buildCalendar() {
  await mkdir('public/vendor',{recursive:true});
  await build({entryPoints:['browser/planning-vendor.js'],outfile:'public/vendor/planning-calendar.js',bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,legalComments:'linked'});
  const licenses=[];
  for(const name of ['fullcalendar','@fullcalendar/core','@full-ui/headless-calendar','preact','temporal-polyfill','temporal-spec']) {
    const directory='node_modules/'+name;
    const files=await readdir(directory).catch(()=>[]),license=files.find(file=>/^license(?:\.|$)/i.test(file));
    if(license)licenses.push(name+'\n'+await readFile(directory+'/'+license,'utf8'));
  }
  await writeFile('public/vendor/planning-calendar.LICENSES.txt',licenses.join('\n\n--------------------\n\n'));
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url))await buildCalendar();
