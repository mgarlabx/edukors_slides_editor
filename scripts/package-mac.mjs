// Builds release/Edukors Slides Editor.app from the local Electron runtime (no download, no install):
// renames the bundle and helpers, declares the .ESF document type, adds the icon and signs ad hoc.
// The bundle is assembled and signed in a temporary folder (cloud-synced folders such as Dropbox add
// extended attributes that break codesign) and then copied to release/; macOS registers the .ESF
// association when the app is opened.
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
if(process.platform!=='darwin')throw Error('package:mac must run on macOS.');
const require=createRequire(import.meta.url);
execFileSync(process.execPath,['scripts/build.mjs',...process.argv.slice(2)],{stdio:'inherit'});
// Read after the build, which bumps the version.
const pkg=JSON.parse(await fs.readFile('package.json','utf8'));
const name=pkg.productName,id='org.edukors.slides',run=(cmd,...args)=>execFileSync(cmd,args,{stdio:['ignore','pipe','inherit']}).toString();
const source=path.resolve(path.dirname(require('electron')),'../..');
const release=path.resolve('release'),final=path.join(release,name+'.app'),staging=await fs.mkdtemp(path.join(os.tmpdir(),'esf-package-'));
const bundle=path.join(staging,name+'.app'),contents=path.join(bundle,'Contents');
await fs.mkdir(release,{recursive:true});
run('ditto',source,bundle);
const editPlist=async(file,fn)=>{const json=JSON.parse(run('plutil','-convert','json','-o','-',file));fn(json);await fs.writeFile(file,JSON.stringify(json));run('plutil','-convert','xml1',file);};
// Electron locates helpers as "<executable name> Helper (…).app", so they are renamed with the app.
const frameworks=path.join(contents,'Frameworks');
for(const entry of await fs.readdir(frameworks)){
  const m=/^Electron Helper(.*)\.app$/.exec(entry);if(!m)continue;
  const helperName=name+' Helper'+m[1],helper=path.join(frameworks,helperName+'.app');
  await fs.rename(path.join(frameworks,entry),helper);
  await fs.rename(path.join(helper,'Contents/MacOS','Electron Helper'+m[1]),path.join(helper,'Contents/MacOS',helperName));
  await editPlist(path.join(helper,'Contents/Info.plist'),p=>{p.CFBundleName=p.CFBundleDisplayName=p.CFBundleExecutable=helperName;p.CFBundleIdentifier=p.CFBundleIdentifier.replace('com.github.Electron',id);});
}
await fs.rename(path.join(contents,'MacOS/Electron'),path.join(contents,'MacOS',name));
// Icon: rasterize the neutral SVG with system tools into an .icns.
const work=path.join(release,'.icon-work'),iconset=path.join(work,'icon.iconset');
await fs.rm(work,{recursive:true,force:true});await fs.mkdir(iconset,{recursive:true});
try{run('qlmanage','-t','-s','1024','-o',work,'build/icon.svg');}
catch{
  // Quick Look may be unavailable in a restricted build environment; AppKit renders the same SVG offline.
  run('swift','-module-cache-path',path.join(os.tmpdir(),'edukors-swift-cache'),'scripts/raster-icon.swift','build/icon.svg',path.join(work,'icon.svg.png'));
}
const master=path.join(work,'icon.svg.png');
for(const size of [16,32,128,256,512])for(const scale of [1,2]){
  run('sips','-z',String(size*scale),String(size*scale),master,'--out',path.join(iconset,`icon_${size}x${size}${scale>1?'@2x':''}.png`));
}
try{run('iconutil','-c','icns',iconset,'-o',path.join(contents,'Resources/icon.icns'));}
catch{
  // ICNS supports PNG payloads directly; this also works when IconServices is unavailable.
  const chunk=(type,data)=>{const header=Buffer.alloc(8);header.write(type);header.writeUInt32BE(data.length+8,4);return Buffer.concat([header,data]);};
  const entries=[['icp4','16x16'],['ic11','16x16@2x'],['icp5','32x32'],['ic12','32x32@2x'],['ic07','128x128'],['ic13','128x128@2x'],['ic08','256x256'],['ic14','256x256@2x'],['ic09','512x512'],['ic10','512x512@2x']];
  const chunks=await Promise.all(entries.map(async([type,size])=>chunk(type,await fs.readFile(path.join(iconset,`icon_${size}.png`)))));
  await fs.writeFile(path.join(contents,'Resources/icon.icns'),chunk('icns',Buffer.concat(chunks)));
}
await fs.rm(path.join(contents,'Resources/electron.icns'),{force:true});
await fs.rm(work,{recursive:true,force:true});
await editPlist(path.join(contents,'Info.plist'),p=>{
  Object.assign(p,{CFBundleName:name,CFBundleDisplayName:name,CFBundleExecutable:name,CFBundleIdentifier:id,CFBundleIconFile:'icon.icns',
    CFBundleShortVersionString:pkg.version,CFBundleVersion:pkg.version,LSApplicationCategoryType:'public.app-category.productivity',NSHumanReadableCopyright:'',
    CFBundleDocumentTypes:[{CFBundleTypeName:'Edukors Slides Editor Presentation',CFBundleTypeRole:'Editor',LSHandlerRank:'Owner',LSItemContentTypes:[id+'.esf'],CFBundleTypeIconFile:'icon.icns'}],
    UTExportedTypeDeclarations:[{UTTypeIdentifier:id+'.esf',UTTypeDescription:'Edukors Slides Editor Presentation',UTTypeConformsTo:['public.zip-archive','public.data'],UTTypeIconFile:'icon.icns',
      UTTypeTagSpecification:{'public.filename-extension':['esf','ESF'],'public.mime-type':['application/vnd.edukors.slides+zip']}}]});
  for(const key of ['ElectronAsarIntegrity','NSCameraUsageDescription','NSMicrophoneUsageDescription','NSAudioCaptureUsageDescription','NSBluetoothPeripheralUsageDescription','NSBluetoothAlwaysUsageDescription'])delete p[key];
});
// The app is loaded unpacked from Resources/app; the bundles in dist/ already include React and fflate.
const resources=path.join(contents,'Resources');await fs.rm(path.join(resources,'default_app.asar'),{force:true});
const appDir=path.join(resources,'app');await fs.mkdir(path.join(appDir,'dist'),{recursive:true});
for(const file of ['main.cjs','preload.cjs','ui.js','ui.css','index.html'])await fs.copyFile(path.join('dist',file),path.join(appDir,'dist',file));
await fs.writeFile(path.join(appDir,'package.json'),JSON.stringify({name:pkg.name,productName:name,version:pkg.version,main:'dist/main.cjs'},null,2));
run('xattr','-cr',bundle);
run('codesign','--force','--deep','--sign','-',bundle);
run('codesign','--verify','--deep','--strict',bundle);
// Archive the clean, signed staging bundle before Dropbox can attach metadata to the delivered .app.
const archive=path.join(release,`${name}-${pkg.version}.zip`);
await fs.rm(archive,{force:true});run('ditto','-c','-k','--keepParent','--norsrc','--noextattr',bundle,archive);
await fs.rm(final,{recursive:true,force:true});run('ditto',bundle,final);await fs.rm(staging,{recursive:true,force:true});
// Cloud storage can attach Finder metadata during the copy; verify the actual delivered bundle too.
run('xattr','-cr',final);run('codesign','--verify','--deep','--strict',final);
console.log('Packaged',final);
console.log('Archived',archive);
