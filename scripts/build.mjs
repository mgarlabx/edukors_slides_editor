import {build} from 'esbuild';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
await mkdir('dist',{recursive:true});
// Version by date, as in the other Edukors apps: package.json YY.M.D (26.11.2), shown as v.YY.MM.DD (v.26.11.02).
// --version=YY.M.D (or X.Y.Z) sets another one, e.g. a second build released the same day.
const pkg=JSON.parse(await readFile('package.json','utf8')),explicit=process.argv.find(a=>a.startsWith('--version='))?.slice(10);
if(explicit&&!/^\d+\.\d+\.\d+$/.test(explicit))throw Error('Use --version=YY.M.D');
const today=new Date(),dated=`${today.getFullYear()%100}.${today.getMonth()+1}.${today.getDate()}`;
pkg.version=explicit||(process.argv.includes('--no-bump')||process.env.CI?pkg.version:dated);
const version=JSON.stringify('v.'+pkg.version.split('.').map((n,i)=>i?n.padStart(2,'0'):n).join('.'));
// Common's page scripts (package, conversations) are loaded by its boot.js before the editor: the editor uses those.
const shared={name:'common-page-scripts',setup(b){b.onResolve({filter:/edukors-common-ux[\\/]src[\\/](package[\\/]package|ai[\\/]ui[\\/]ai-conversations)\.js$/},()=>({path:'common',namespace:'common-page'}));b.onLoad({filter:/.*/,namespace:'common-page'},()=>({contents:'',loader:'js'}));}};
const page={bundle:true,platform:'browser',target:'es2022',format:'iife',define:{'process.env.NODE_ENV':'"production"',__APP_VERSION__:version,__PACKAGE_VERSION__:JSON.stringify(pkg.version)},loader:{'.svg':'dataurl','.md':'text'}};
await Promise.all([
  // ES module: Common's desktop host (external, from node_modules) finds its own files through import.meta.url.
  build({entryPoints:['src/main/index.ts'],bundle:true,platform:'node',target:'node22',format:'esm',outfile:'dist/main.mjs',external:['electron','edukors-common-ux/desktop/*'],define:{__PACKAGE_VERSION__:JSON.stringify(pkg.version)},
    banner:{js:'import {createRequire as __esfRequire} from "node:module";const require=__esfRequire(import.meta.url);'}}),
  build({entryPoints:['src/main/preload.ts'],bundle:true,platform:'node',target:'node22',format:'cjs',outfile:'dist/preload.cjs',external:['electron']}),
  build({...page,entryPoints:['src/common/config.ts'],outfile:'dist/config.js'}),
  build({...page,entryPoints:['src/common/editor.tsx'],outfile:'dist/slides.js',plugins:[shared]})
]);
await writeFile('package.json',JSON.stringify(pkg,null,2)+'\n');
// The page: the configuration, then Common's shell, which loads its scripts and then the editor.
await writeFile('dist/index.html',`<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; frame-src esf-frame:; connect-src 'self' data: blob:; base-uri 'none'; form-action 'none';"><title>Edukors Slides Editor</title><link rel="stylesheet" href="slides.css"></head><body><script src="config.js"></script><script src="../node_modules/edukors-common-ux/src/shell/boot.js" data-app="slides.js"></script></body></html>`);
console.log(`Built desktop app ${pkg.version} in dist/`);
