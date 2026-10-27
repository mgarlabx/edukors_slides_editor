// Builds this system's installers with electron-builder (electron-builder.yml) into release/.
// --version=X.Y.Z and --no-bump go to build.mjs; other arguments go to electron-builder (e.g. --x64 --arm64, --dir).
// Locally the bundle is assembled in a temporary folder: cloud-synced folders such as Dropbox add extended
// attributes that break codesign. On macOS the .app is also copied to release/ for the e2e (--packaged).
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const require=createRequire(import.meta.url),args=process.argv.slice(2),ours=a=>a.startsWith('--version=')||a==='--no-bump';
execFileSync(process.execPath,['scripts/build.mjs',...args.filter(ours)],{stdio:'inherit'});
const platform={darwin:'--mac',win32:'--win',linux:'--linux'}[process.platform],release=path.resolve('release');
const out=process.env.CI?release:await fs.mkdtemp(path.join(os.tmpdir(),'esf-package-'));
execFileSync(process.execPath,[require.resolve('electron-builder/cli.js'),platform,'--publish','never','-c.directories.output='+out,...args.filter(a=>!ours(a))],{stdio:'inherit'});
if(out!==release){
  await fs.mkdir(release,{recursive:true});
  for(const e of await fs.readdir(out,{withFileTypes:true}))if(e.isFile())await fs.copyFile(path.join(out,e.name),path.join(release,e.name));
  if(process.platform==='darwin')for(const dir of await fs.readdir(out)){
    const app=path.join(out,dir,'Edukors Slides Editor.app');if(!dir.startsWith('mac')||!await fs.stat(app).then(()=>true,()=>false))continue;
    const final=path.join(release,'Edukors Slides Editor.app');await fs.rm(final,{recursive:true,force:true});
    execFileSync('ditto',[app,final]);execFileSync('xattr',['-cr',final]);break;
  }
  await fs.rm(out,{recursive:true,force:true});
}
console.log('Installers in',release);
