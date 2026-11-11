// What makes this app the Slides Editor inside the shared shell (Edukors Common, docs/common-shell.md "App integration").
// Loaded before Common's boot.js, which reads it.
import {TERMS_VERSION} from '../shared/model';
import {catalogs} from '../ui/i18n';
import termsPt from '../ui/help/terms-of-use.md';
import termsEn from '../ui/help/terms-of-use.en.md';
import termsEs from '../ui/help/terms-of-use.es.md';
import guidePt from '../ui/help/guide.md';
import guideEn from '../ui/help/guide.en.md';
import guideEs from '../ui/help/guide.es.md';
import guideZh from '../ui/help/guide.zh.md';
import guideHi from '../ui/help/guide.hi.md';
import termsZh from '../ui/help/terms-of-use.zh.md';
import termsHi from '../ui/help/terms-of-use.hi.md';
declare const __APP_VERSION__:string;
const mac=/Mac|iPhone|iPad/i.test(navigator.platform||navigator.userAgent);
const keys=(k:string)=>mac?k:[k.includes('⌘')&&'Ctrl',k.includes('⇧')&&'Shift',k.includes('⌥')&&'Alt',k.replace(/[⌘⇧⌥]/g,'')].filter(Boolean).join('+');
const shortcuts:[string,string][]=[['⌘N','new'],['⌘O','open'],['⌘S','save'],['⇧⌘S','saveAs'],['⌘Z / ⇧⌘Z','helpUndoRedo'],['⌘C / ⌘V','helpCopyPaste'],['⌘D','duplicate'],['⌫','helpDelete'],['⌘A','helpSelectAll'],['⇧⌘N','newSlide'],['⌘↵','present'],['⌘E','export'],['⌥⌘0','slidePanel'],['⇧⌘A','openAI'],['⌘,','settings'],['Esc','helpCancel']];
// The quick guide is written from the interface texts, with the shortcuts of this system.
function quickGuide(lang:keyof typeof catalogs){
  const own=catalogs[lang] as Record<string,string>,t=new Proxy(own,{get:(o,k:string)=>o[k]||(catalogs.en as Record<string,string>)[k]});
  return `${t.helpLead}\n\n${[1,2,3,4,5,6,7].map(n=>`${n}. ${t['helpStep'+n]}`).join('\n')}\n\n## ${t.helpShortcuts}\n\n| | |\n| --- | --- |\n${shortcuts.map(([k,label])=>`| \`${k.split(' / ').map(keys).join(' / ')}\` | ${t[label]} |`).join('\n')}\n`;
}
(globalThis as any).EdukorsAppConfig={
  name:'Edukors Slides Editor',
  version:__APP_VERSION__,  // v.YY.MM.DD, from package.json (scripts/build.mjs)
  termsVersion:TERMS_VERSION,
  // Interface in five languages (Common's registry: pt, en, es, zh, hi); help and terms in each of them.
  help:{quickGuide:{pt:quickGuide('pt'),en:quickGuide('en'),es:quickGuide('es'),zh:quickGuide('zh'),hi:quickGuide('hi')},fullGuide:{pt:guidePt,en:guideEn,es:guideEs,zh:guideZh,hi:guideHi},termsOfUse:{pt:termsPt,en:termsEn,es:termsEs,zh:termsZh,hi:termsHi}},
  // Text, shape, line and image come from Common's Insert group; Slides adds link and interactive question next to them.
  insert:['text','table','shape','line','image'],
  // The slide list opens the first time; afterwards Common remembers the person's choice.
  sidebarOpen:true,
  file:{
    extension:'.eslx',
    // Export (HTML with the player, PDF, PPTX of images) is the editor's own command: the formats need the main process.
    exportFormats:[],
    // .esf (earlier versions) and .pptx open directly as presentations without a file; Save always asks for an .eslx.
    importCommand:false,
    importFormats:[{id:'esf',extensions:['.esf']},{id:'pptx',extensions:['.pptx']}]
  }
};
