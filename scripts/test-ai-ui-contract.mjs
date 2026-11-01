import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement as h} from 'react';
import {renderToStaticMarkup as render} from 'react-dom/server';
import {AssistantAccounts,AccountPicker,ProviderSetup,SignIn,ModelOptions,ModePicker,EffortSlider,effortStops,UsageSummary,normalizeOptions,installation,uiText,PROVIDERS} from '@edukors/ai-ui';
const noop=()=>{},base={onOpen:noop,onVerify:async()=>{}};
test('only verified model efforts survive a model or account change',()=>{
 assert.deepEqual(normalizeOptions([{id:'a',efforts:['high']},{id:'b'}],'b','high'),{model:'b',effort:'auto',levels:[]});
 assert.equal(normalizeOptions([{id:'a',efforts:['low','high']}],'a','high').effort,'high');
 assert.equal(normalizeOptions([],'custom','max').effort,'auto');
});
test('installation instructions distinguish CLI from desktop and use official per-system commands',()=>{
 for(const p of PROVIDERS)for(const platform of ['mac','windows','linux']){
  const html=render(h(ProviderSetup,{lang:'pt',provider:p.id,status:'missing',platform,...base}));
  assert.match(html,/desktop/);assert.match(html,/Verificar instalação/);assert.match(html,/href="https:/);assert.match(html,new RegExp(p.cli.replace(/[()]/g,'\\$&')));
  assert.match(installation(p.id,platform),platform==='windows'?/install.ps1 \| iex$/:/install.sh \| (bash|sh)$/);
 }
 assert.throws(()=>installation('unknown','mac'));
 assert.doesNotMatch(render(h(ProviderSetup,{provider:'claude',status:'unsupported',...base})),/install\.sh/);
});
test('first-run setup offers adding an account when no CLI is present',()=>{
 const html=render(h(AssistantAccounts,{lang:'pt',accounts:[],providers:[{id:'claude',status:'missing'}],onSelect:noop,onCreate:async()=>'',onConnect:async()=>{},onLogout:async()=>{},onRename:async()=>{},onRemove:async()=>{},onCode:async()=>{},onCancel:noop,...base}));
 assert.match(html,/Adicionar conta/);assert.doesNotMatch(html,/disabled/);
});
test('unknown usage is not represented as zero; all provider windows are preserved',()=>{
 const unknown=render(h(UsageSummary,{lang:'pt'}));assert.match(unknown,/Uso ainda não informado/);assert.doesNotMatch(unknown,/<meter/);
 const known=render(h(UsageSummary,{lang:'en',usage:{observedAt:'2026-10-31T12:00:00Z',windows:[{name:'five_hour',used:0},{name:'seven_day',used:.42},{name:'43200min',used:.1}]}}));
 assert.equal((known.match(/<meter/g)||[]).length,3);assert.match(known,/42%/);assert.match(known,/43200min/);
});
test('login code appears only when requested and unavailable accounts stay visible',()=>{
 assert.doesNotMatch(render(h(SignIn,{login:{url:'https://example.test',acceptsCode:false},onCode:async()=>{},onCancel:noop,onOpen:noop})),/Authorization code/);
 assert.match(render(h(SignIn,{login:{url:'https://example.test',acceptsCode:true},onCode:async()=>{},onCancel:noop,onOpen:noop})),/Authorization code/);
 const html=render(h(AccountPicker,{accounts:[{id:'a',providerId:'codex',label:'Unavailable',supported:false}],value:'',onChange:noop}));assert.match(html,/disabled=""/);assert.match(html,/Unavailable/);
});
test('shared strings have translations for all 3 languages and content is escaped',()=>{
 for(const lang of ['pt','en','es'])for(const key of ['title','accounts','guide','verify','usage','defaultAccount'])assert.notEqual(uiText(lang,key),key);
 const html=render(h(ModelOptions,{models:[{id:'bad',label:'<script>alert(1)</script>'}],value:'bad',onModel:noop,onEffort:noop}));assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);
});

test('composer controls use icon menu chips and a discrete effort slider',()=>{
 const mode=render(h(ModePicker,{lang:'pt',value:'ask',onChange:noop}));
 assert.match(mode,/aria-haspopup="menu"/);assert.match(mode,/<svg/);assert.doesNotMatch(mode,/<select/);
 const model=render(h(ModelOptions,{models:[{id:'default',efforts:['low','high']}],onModel:noop,onEffort:noop}));
 assert.match(model,/aria-haspopup="dialog"/);assert.doesNotMatch(model,/<select/);
 const slider=render(h(EffortSlider,{lang:'pt',levels:['low','high'],effort:'high',onChange:noop}));
 assert.match(slider,/type="range"/);assert.match(slider,/aria-label="Esforço"/);assert.match(slider,/aria-valuetext="Alto"/);assert.match(slider,/max="2"/);assert.doesNotMatch(slider,/<select/);
 assert.deepEqual(effortStops(['auto','low','low','high']),['auto','low','high']);
});
