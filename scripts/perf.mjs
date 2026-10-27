// Opens generated 50/300-slide projects, measuring open time, memory and HTML/PDF export.
import {_electron as electron} from 'playwright';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
const require=createRequire(import.meta.url);
await build({entryPoints:['tests/perf-fixture.ts'],bundle:true,platform:'node',target:'node22',format:'esm',outfile:'test-results/perf-fixture.mjs'});
const files=JSON.parse(execFileSync(process.execPath,['test-results/perf-fixture.mjs'],{encoding:'utf8'}));
const report={};
for(const [count,file] of Object.entries(files)){
  const env={...process.env,ESF_DATA_DIR:path.resolve('test-results/perf/appdata-'+count),ESF_HIDDEN:process.env.ESF_SHOW?'':'1'};delete env.ELECTRON_RUN_AS_NODE;
  const app=await electron.launch({executablePath:require('electron'),args:['.',file],env,timeout:30000});
  try{
    const page=await app.firstWindow();await app.evaluate(({dialog})=>{dialog.showSaveDialog=async(_w,o)=>({canceled:false,filePath:o.defaultPath});});let t=Date.now();
    await page.waitForFunction(n=>document.querySelectorAll('.slide-item').length===Number(n),count,{timeout:120000});
    const r={openMs:Date.now()-t};
    t=Date.now();await page.locator('.slide-item button').nth(Number(count)-1).click();await page.locator('.statusbar').filter({hasText:`Slide ${count} de ${count}`}).waitFor();r.selectLastMs=Date.now()-t;
    t=Date.now();await page.frameLocator('.slide-item:last-child iframe').locator('h1,h2,blockquote').first().waitFor({timeout:120000});r.lastThumbAfterScrollMs=Date.now()-t;
    r.loadedThumbs=await page.locator('.slide-item iframe').count();
    r.memoryMB=Math.round((await app.evaluate(({app})=>app.getAppMetrics().reduce((a,m)=>a+m.memory.workingSetSize,0)))/1024);
    for(const format of ['html','pdf']){
      await page.getByRole('button',{name:'Exportar',exact:true}).click();
      if(format==='pdf')await page.locator('.format-options button').filter({hasText:'PDF'}).click();
      t=Date.now();await page.getByRole('button',{name:'Exportar '+format.toUpperCase(),exact:true}).click();
      await page.getByText('Exportação concluída',{exact:true}).waitFor({timeout:600000});r[format+'Ms']=Date.now()-t;
      await page.getByRole('button',{name:'Cancelar',exact:true}).click();
    }
    r.htmlKB=Math.round((await fs.stat(path.join(path.dirname(file),path.basename(file,'.ESF')+'.html'))).size/1024);r.esfKB=Math.round((await fs.stat(file)).size/1024);
    report[count]=r;console.log(count,JSON.stringify(r));
  }finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
}
await fs.writeFile('test-results/perf/report.json',JSON.stringify(report,null,2));
