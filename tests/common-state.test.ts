import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newDeck,newSlide,newMaster} from '../src/shared/model';
import {Store} from '../src/common/store';
import {assistantChanges,assistantContext,createSlidesTools} from '../src/common/assistant-tools';

test('Store: changes are undo steps, selection follows them and histories are isolated by document',()=>{
  const store=new Store();store.add(1,newDeck('First'));store.add(2,newDeck('Second'));
  const first=store.get(1)!.deck.slides[0].id,added=newSlide(store.get(1)!.deck.layouts[0]);
  assert.equal(store.mutate(1,d=>{d.slides.push(added);},[added.id]),true);
  assert.deepEqual(store.get(1)!.selected,[added.id]);
  assert.equal(store.get(2)!.past.length,0);
  assert.equal(store.undo(1),true);
  assert.deepEqual(store.get(1)!.selected,[first]);
  assert.equal(store.undo(1,true),true);
  assert.deepEqual(store.get(1)!.selected,[added.id]);
  store.undo(1);store.mutate(1,d=>{d.title='Branch';});
  assert.equal(store.get(1)!.future.length,0);
  assert.equal(store.mutate(1,d=>{d.title='Branch';}),false,'no step without a change');
});

test('Store: an invalid change leaves the presentation and history as they were',()=>{
  const store=new Store();store.add(1,newDeck('Atomic'));
  const before=structuredClone(store.get(1)!.deck);
  assert.throws(()=>store.mutate(1,d=>{d.slides=[];}),/slide/i);
  assert.deepEqual(store.get(1)!.deck,before);
  assert.equal(store.get(1)!.past.length,0);
});

test('Store: saving marks the version written, not later edits; new documents are not modified, imports are',()=>{
  const store=new Store();store.add(1,newDeck('Saved'),{saved:true});store.add(2,newDeck('Imported'));
  assert.equal(store.modified(1),false);assert.equal(store.modified(2),true);
  store.mutate(1,d=>{d.title='Saved revision';});const written=store.get(1)!.version;
  store.mutate(1,d=>{d.title='After the save started';});
  store.markSaved(1,written);
  assert.equal(store.modified(1),true);
  store.undo(1);store.markSaved(1,store.get(1)!.version);
  assert.equal(store.modified(1),false);
});

test('Store: merged typing is one undo step; the slide master view survives only while its item exists',()=>{
  const store=new Store();store.add(1,newDeck('Notes'));
  store.mutate(1,d=>{d.slides[0].notes='First';});
  store.mutate(1,d=>{d.slides[0].notes='First sentence';},undefined,true);
  assert.equal(store.get(1)!.past.length,1);
  store.undo(1);assert.equal(store.get(1)!.deck.slides[0].notes,'');
  const base=newMaster('Alternate');
  store.mutate(1,d=>{d.masters.push(base);});
  store.update(1,t=>({...t,masterView:'m:'+base.id}));
  store.undo(1);
  assert.equal(store.get(1)!.masterView,null);
});

test('Assistant: edits go to the conversation document as one undo step; context names the selection and view',()=>{
  const store=new Store();store.add(1,newDeck('First'));store.add(2,newDeck('Second'));
  const [read,apply]=createSlidesTools(store);
  const doc={id:1},revision=read.run(doc).revision,id=store.get(1)!.deck.slides[0].id;
  const result=apply.run(doc,{expectedRevision:revision,slideUpdates:[{id,title:'AI edit'}],systemPrompt:'Audience: teachers.'});
  assert.equal(result.changed,true);assert.equal(result.revision,revision+1);
  assert.equal(store.get(1)!.deck.slides[0].title,'AI edit');assert.equal(store.get(1)!.deck.systemPrompt,'Audience: teachers.');
  assert.equal(store.get(2)!.deck.slides[0].title,'');
  store.undo(1);
  assert.equal(store.get(1)!.deck.slides[0].title,'');assert.equal(store.get(1)!.deck.systemPrompt,undefined);
  store.update(1,t=>({...t,masterView:'m:'+t.deck.activeMaster}));
  const context=assistantContext(store,1)!;
  assert.equal(context.revision,store.get(1)!.version);
  assert.match(String((context as any).view),/Slide master: base/);
  assert.deepEqual(context.project.slides.map(s=>s.id),[id]);
});

test('Assistant: stale revisions, deleted slides, unknown fields and direct asset imports are refused',()=>{
  const store=new Store();store.add(1,newDeck('Concurrent edit'));
  const s=newSlide(store.get(1)!.deck.layouts[0]);store.mutate(1,d=>{d.slides.push(s);});
  const deck=store.get(1)!.deck,v=store.get(1)!.version;
  assert.throws(()=>assistantChanges(deck,v,{expectedRevision:v-1,systemPrompt:'stale'}),/changed/);
  assert.throws(()=>assistantChanges(deck,v,{expectedRevision:v,slideOrder:[deck.slides[0].id]}),/delete/);
  assert.throws(()=>assistantChanges(deck,v,{expectedRevision:v,assets:[{id:'asset-new',path:'outside.png'}]}),/import_image/);
  assert.throws(()=>assistantChanges(deck,v,{expectedRevision:v,unknown:'value'}),/Unknown/);
  assert.equal(store.get(1)!.version,v);
});

test('Assistant: import_image adds the downloaded image as a resource of that document only',async()=>{
  const store=new Store();store.add(1,newDeck('Images'));
  const tools=createSlidesTools(store,{downloadImage:async url=>({id:'asset-abc',name:url.split('/').at(-1)!,mime:'image/png',data:'iVBORw0KGgo='})});
  const tool=tools.find(t=>t.name==='import_image')!;
  const r=await tool.run({id:1},{url:'https://example.org/a.png'});
  assert.equal(r.reference,'asset:asset-abc');
  assert.equal(store.get(1)!.deck.assets.length,1);
  assert.equal(createSlidesTools(store).some(t=>t.name==='import_image'),false);
});

test('Assistant: read_image shows an image of the presentation to the model',async()=>{
  const store=new Store(),deck=newDeck('Images');deck.assets.push({id:'asset-img1',name:'a.png',mime:'image/png',data:'iVBORw0KGgo='},{id:'asset-svg1',name:'b.svg',mime:'image/svg+xml',data:'PHN2Zy8+'});store.add(1,deck);
  const read=createSlidesTools(store).find(t=>t.name==='read_image')!;
  assert.equal(read.changes,false);
  const r=await read.run({id:1},{asset:'asset:asset-img1'});
  assert.deepEqual(r.images,[{mimeType:'image/png',data:'iVBORw0KGgo='}]);assert.equal(r.asset,'asset:asset-img1');
  await assert.rejects(read.run({id:1},{asset:'nope'}),/no image asset:nope/);
  await assert.rejects(read.run({id:1},{asset:'asset-svg1'}),/cannot be shown/);
  const drawn=createSlidesTools(store,{showImage:async a=>({mimeType:'image/png',data:'drawn-'+a.id,width:10,height:5})}).find(t=>t.name==='read_image')!;
  const s=await drawn.run({id:1},{asset:'asset-svg1'});
  assert.deepEqual(s.images,[{mimeType:'image/png',data:'drawn-asset-svg1'}]);assert.equal(s.shownWidth,10);
});
