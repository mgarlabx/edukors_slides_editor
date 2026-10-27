// Internal test tool: writes 50- and 300-slide .ESF packages under test-results/perf for timing runs.
import fs from 'node:fs/promises';
import path from 'node:path';
import {newDeck,newSlide} from '../src/shared/model';
import {ProjectStore} from '../src/main/projects';
const out=path.resolve('test-results/perf');await fs.rm(out,{recursive:true,force:true});await fs.mkdir(out,{recursive:true});
const result:Record<string,string>={};
for(const count of [50,300]){
  const deck=newDeck('Desempenho '+count),layout=deck.layouts[0];
  // Typical content: a title, three cards with text and a progressive reveal.
  deck.slides=Array.from({length:count},(_,i)=>{const s=newSlide(layout);s.title=`Slide ${i+1}`;s.html=`<section class="slide"><h2 data-field="title">Slide ${i+1}</h2><ul>${[1,2,3].map(n=>`<li data-step data-field="point${n}">Ideia ${n}</li>`).join('')}</ul></section>`;return s;});
  const store=new ProjectStore(path.join(out,'workspaces')),p=await store.create(path.join(out,`Desempenho ${count}.ESF`),deck);await store.close(p.deck.id);result[count]=p.path;
}
console.log(JSON.stringify(result));
