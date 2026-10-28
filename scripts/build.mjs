import {build} from 'esbuild';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
await mkdir('dist',{recursive:true});
// Every local build bumps the patch version; the UI shows it in the status bar. CI (or --no-bump) keeps it: the release tag decides.
const pkg=JSON.parse(await readFile('package.json','utf8')),explicit=process.argv.find(a=>a.startsWith('--version='))?.slice(10);
if(explicit&&!/^\d+\.\d+\.\d+$/.test(explicit))throw Error('Use --version=MAJOR.MINOR.PATCH');
const v=pkg.version.split('.').map(Number),bump=!process.env.CI&&!process.argv.includes('--no-bump');
pkg.version=explicit||(bump?`${v[0]}.${v[1]}.${v[2]+1}`:pkg.version);
await Promise.all([
  // The AI library and the Agent SDK are ES modules that read import.meta.url, which a CommonJS bundle lacks.
  build({entryPoints:['src/main/index.ts'],bundle:true,platform:'node',target:'node22',format:'cjs',outfile:'dist/main.cjs',external:['electron'],define:{'import.meta.url':'__esf_import_meta_url'},banner:{js:'const __esf_import_meta_url=require("url").pathToFileURL(__filename).href;'}}),
  build({entryPoints:['src/main/preload.ts'],bundle:true,platform:'node',target:'node22',format:'cjs',outfile:'dist/preload.cjs',external:['electron']}),
  build({entryPoints:['src/ui/App.tsx'],bundle:true,platform:'browser',target:'es2022',format:'iife',outfile:'dist/ui.js',define:{'process.env.NODE_ENV':'"production"',__APP_VERSION__:JSON.stringify(pkg.version)},loader:{'.svg':'dataurl'}})
]);
await writeFile('package.json',JSON.stringify(pkg,null,2)+'\n');
await writeFile('dist/index.html',`<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-src esf-frame:; connect-src 'none'; base-uri 'none';"><title>Edukors Slides Editor</title><link rel="stylesheet" href="ui.css"></head><body><div id="root"></div><script src="ui.js"></script></body></html>`);
console.log(`Built desktop app ${pkg.version} in dist/`);
