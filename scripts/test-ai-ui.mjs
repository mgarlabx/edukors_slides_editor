// Browser-level contract tests for the shared UI, with no provider credentials.
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),out=path.resolve('test-results/ai-ui');await fs.mkdir(out,{recursive:true});
const source=path.resolve('../edukors_ai_cli/packages/ui');
await build({stdin:{contents:`
import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{AssistantAccounts,ModelOptions,ModePicker,UsageSummary,AssistantHeader,ConversationList,QuestionCard,normalizeOptions,installation}from ${JSON.stringify(source+'/index.js')};
window.contract={normalized:normalizeOptions([{id:'fast'},{id:'deep',efforts:['high']}],'fast','high'),command:installation('claude','windows'),events:[]};
function Fixture(){const[providers,P]=useState([{id:'claude',status:'missing'},{id:'codex',status:'missing'}]),[accounts,A]=useState([]),[value,V]=useState(''),[model,M]=useState('default'),[effort,E]=useState('auto'),[answer,Q]=useState(false),[mode,S]=useState('ask');const log=(...v)=>window.contract.events.push(v);return <main style={{maxWidth:540,margin:'auto',padding:12}}>
<AssistantHeader lang="pt" title="Uma conversa sobre o curso" document="Curso de exemplo" onNew={()=>log('new')} onHistory={()=>log('history')} onClose={()=>log('close')}/>
<AssistantAccounts lang="pt" accounts={accounts} providers={providers} value={value} onSelect={V} onCreate={async(p,label)=>{A([{id:'a',providerId:p,label,status:{state:'disconnected'}}]);V('a');log('create',p,label);return'a';}} onConnect={async()=>A(a=>a.map(x=>({...x,status:{state:'connected',identity:'teacher@example.test'}})))} onLogout={async()=>{}} onRename={async()=>{}} onRemove={async()=>{}} onVerify={async()=>{P(p=>p.map(x=>({...x,status:'ready'})));log('verify');}} onOpen={url=>log('url',url)} onCode={async()=>{}} onCancel={()=>{}}/>
<ModePicker lang="pt" value={mode} onChange={S}/><ModelOptions lang="pt" models={[{id:'default',efforts:['low','high']},{id:'fast',label:'Rápido'},{id:'deep',label:'Detalhado',efforts:['high']}]} value={model} effort={effort} onModel={M} onEffort={E}/>
<UsageSummary lang="pt" usage={{observedAt:new Date().toISOString(),windows:[{name:'five_hour',used:.17,resetsAt:'2099-01-01T00:00:00Z'},{name:'seven_day',used:.42}]}}/><UsageSummary lang="pt"/>
<ConversationList lang="pt" current="one" items={[{id:'one',title:'Uma conversa',updated:Date.now(),account:'Trabalho'}]} onOpen={id=>log('open',id)} onDelete={()=>{}}/>
<QuestionCard lang="pt" question="Qual público?" options={['Professores','Estudantes']} answered={answer} onAnswer={v=>{Q(true);log('answer',v);}}/>
</main>};createRoot(document.getElementById('root')).render(<Fixture/>);`,loader:'jsx',resolveDir:process.cwd()},bundle:true,platform:'browser',format:'iife',outfile:path.join(out,'fixture.js'),plugins:[{name:'host-peers',setup(b){b.onResolve({filter:/^react(\/.*)?$/},a=>({path:require.resolve(a.path)}));b.onResolve({filter:/^@edukors\/ai-cli\/settings$/},()=>({path:path.resolve('../edukors_ai_cli/src/settings.ts')}));}}]});
const browser=await chromium.launch({headless:true,...process.env.EDUKORS_TEST_BROWSER?{executablePath:process.env.EDUKORS_TEST_BROWSER}:{channel:'chrome'}});
try{const page=await browser.newPage({viewport:{width:540,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.setContent('<html lang="pt"><body style="margin:0"><div id="root"></div></body></html>');await page.addStyleTag({path:source+'/style.css'});await page.addScriptTag({path:path.join(out,'fixture.js')});
assert.deepEqual(await page.evaluate(()=>window.contract.normalized),{model:'fast',effort:'auto',levels:[]});
assert.equal(await page.evaluate(()=>window.contract.command),'irm https://claude.ai/install.ps1 | iex');
await page.getByRole('button',{name:'Adicionar conta',exact:true}).click();await page.getByText('Claude Code (CLI)',{exact:true}).waitFor();
assert.match(await page.locator('.eai-command').innerText(),/install\.(ps1|sh)/);
await page.getByRole('link',{name:'Abrir guia oficial'}).click();assert.deepEqual((await page.evaluate(()=>window.contract.events)).at(-1),['url','https://code.claude.com/docs/en/quickstart']);
await page.getByRole('button',{name:'Verificar instalação',exact:true}).click();await page.getByLabel('Nome da conta',{exact:true}).fill('Trabalho');await page.getByRole('button',{name:'Entrar na conta',exact:true}).click();await page.getByText('Claude · teacher@example.test').waitFor();
const modeButton=page.getByRole('button',{name:'Modo: Revisar antes de aplicar',exact:true});await modeButton.click();
const modeRect=await page.locator('.eai-mode-pop').boundingBox(),modeAnchor=await modeButton.boundingBox();assert.ok(modeRect.y+modeRect.height<=modeAnchor.y,'mode menu opens upward');
await page.getByRole('menuitemradio',{name:/^Aplicar alterações/}).click();assert.equal(await page.locator('.eai-mode-pop').count(),0);
await page.locator('.eai-model>button').click();
const modelRect=await page.locator('.eai-model-pop').boundingBox(),modelAnchor=await page.locator('.eai-model>button').boundingBox();assert.ok(modelRect.y+modelRect.height<=modelAnchor.y,'model menu opens upward');
await page.getByRole('menuitemradio',{name:'Detalhado',exact:true}).click();const slider=page.getByRole('slider',{name:'Esforço',exact:true});await slider.focus();await slider.press('End');assert.equal(await slider.getAttribute('aria-valuetext'),'Alto');
await page.getByRole('menuitemradio',{name:'Rápido',exact:true}).click();assert.equal(await page.getByRole('slider',{name:'Esforço',exact:true}).count(),0);
await page.keyboard.press('Escape');assert.equal(await page.locator('.eai-model-pop').count(),0);assert.equal(await page.locator('.eai-model>button').evaluate(el=>el===document.activeElement),true);
await page.locator('.eai-usage').first().locator('summary').click();assert.equal(await page.locator('.eai-usage').first().locator('meter').count(),2);assert.equal(await page.locator('.eai-usage').nth(1).locator('meter').count(),0);
await page.getByLabel('Buscar conversas',{exact:true}).fill('trabalho');assert.equal(await page.getByRole('button',{name:'Uma conversa',exact:true}).count(),1);await page.getByRole('button',{name:'Uma conversa',exact:true}).click();
await page.getByLabel('Ou escreva sua resposta',{exact:true}).fill('Professores universitários');await page.getByRole('button',{name:'Enviar resposta',exact:true}).click();await page.getByText('Respondida',{exact:true}).waitFor();
for(const width of [320,400,540]){await page.setViewportSize({width,height:900});await page.screenshot({path:path.join(out,`shared-${width}.png`),fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`horizontal overflow at ${width}`);}
assert.deepEqual(errors,[]);console.log('Shared AI UI: setup, links, detection, account identity, effort validation, keyboard, usage, history, free answers and 3 viewport widths passed.');
}finally{await browser.close();}
