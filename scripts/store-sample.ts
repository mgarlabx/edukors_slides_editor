// Sample presentation for the store screenshots (scripts/store-screenshots.mjs): a short class on the water cycle in the
// interface's language, with a theme, two layouts, an interactive question and a conversation with the assistant.
import {Deck,Language,Slide,newDeck,uid} from '../src/shared/model';
import {serialize} from '../src/main/projects';
import {writePackage} from '../src/main/package';
import {playerDocument} from '../src/shared/player';

const css=`:root{--paper:#f7f4ee;--ink:#14213d;--accent:#1d6fd1;--muted:#5b6475;--surface:#ffffff}
*{box-sizing:border-box}body{margin:0;font-family:"Segoe UI",Arial,Helvetica,sans-serif;color:var(--ink);background:var(--paper)}
.slide{position:relative;width:1600px;height:900px;padding:90px 110px;overflow:hidden;background:var(--paper)}
h1,h2,h3,p{margin:0}h1{font-size:104px;line-height:1.05;letter-spacing:-3px}h2{font-size:66px;line-height:1.1;letter-spacing:-2px;margin-bottom:48px}h3{font-size:38px;margin-bottom:14px}
p,li{font-size:32px;line-height:1.45;color:var(--muted)}ul{padding-left:40px}li{margin:20px 0}
.cover{display:flex;flex-direction:column;justify-content:center;background:linear-gradient(120deg,#0f3d75,#1d6fd1 60%,#38a3e8);color:#fff}
.cover h1{color:#fff;max-width:1150px}.cover p{color:#d8e8fb;font-size:38px;margin-top:28px}
.wave{position:absolute;right:-120px;bottom:-160px;width:760px;height:760px;border-radius:50%;border:56px solid rgba(255,255,255,.14)}
.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:36px}.card{background:var(--surface);border-radius:28px;padding:44px 40px;box-shadow:0 18px 40px rgba(20,33,61,.10)}
.card .icon{font-size:64px;margin-bottom:18px}.card p{font-size:29px}
.big{display:flex;align-items:center;gap:70px;height:100%}.big b{font-size:260px;line-height:1;color:var(--accent);letter-spacing:-8px}.big p{font-size:44px;color:var(--ink);max-width:640px}
[data-step]{transition:opacity .25s,transform .25s}[data-step].pending{opacity:0;transform:translateY(12px)}@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}`;

const text={
  pt:{title:'O ciclo da água',subtitle:'Ciências · 6º ano · Aula 3',folder:'Ciências',master:'Oceano',cover:'Capa',content:'Conteúdo',blank:'Em branco',heading:'Título',stages:'As três etapas',
    cards:[['☀️','Evaporação','O sol aquece rios e mares, e a água sobe como vapor.'],['☁️','Condensação','No alto, o vapor esfria e forma as nuvens.'],['🌧️','Precipitação','As gotas crescem e voltam à terra como chuva.']],
    fact:'da água da Terra está nos oceanos. Só 3% é doce, e a maior parte está congelada.',question:'Em qual etapa as nuvens se formam?',
    next:'Para a próxima aula',todo:['Observe o céu por três dias e anote as nuvens.','Traga uma foto de chuva no seu bairro.','Pense: de onde vem a água da sua casa?'],
    ask:'Crie um slide com as três etapas do ciclo da água, em cartões, e uma pergunta para a turma no fim.',
    answer:'Pronto! Criei o slide 2 com as três etapas em cartões, cada um com uma frase curta, e o slide 4 com uma pergunta de múltipla escolha que a turma responde pelo celular. Quer que eu acrescente uma ilustração do ciclo?'},
  en:{title:'The water cycle',subtitle:'Science · Grade 6 · Lesson 3',folder:'Science',master:'Ocean',cover:'Cover',content:'Content',blank:'Blank',heading:'Title',stages:'The three stages',
    cards:[['☀️','Evaporation','The sun warms rivers and seas, and water rises as vapor.'],['☁️','Condensation','High up, the vapor cools down and forms clouds.'],['🌧️','Precipitation','Droplets grow and fall back to the ground as rain.']],
    fact:'of the Earth’s water is in the oceans. Only 3% is fresh, and most of it is frozen.',question:'In which stage do clouds form?',
    next:'For the next class',todo:['Watch the sky for three days and note the clouds.','Bring a photo of rain in your neighborhood.','Think: where does the water in your home come from?'],
    ask:'Create a slide with the three stages of the water cycle, as cards, and a question for the class at the end.',
    answer:'Done! Slide 2 now shows the three stages as cards, each with a short sentence, and slide 4 has a multiple-choice question the class answers on their phones. Shall I add an illustration of the cycle?'},
  es:{title:'El ciclo del agua',subtitle:'Ciencias · 6.º grado · Clase 3',folder:'Ciencias',master:'Océano',cover:'Portada',content:'Contenido',blank:'En blanco',heading:'Título',stages:'Las tres etapas',
    cards:[['☀️','Evaporación','El sol calienta ríos y mares, y el agua sube como vapor.'],['☁️','Condensación','En lo alto, el vapor se enfría y forma las nubes.'],['🌧️','Precipitación','Las gotas crecen y vuelven a la tierra como lluvia.']],
    fact:'del agua de la Tierra está en los océanos. Solo el 3% es dulce, y casi toda está congelada.',question:'¿En qué etapa se forman las nubes?',
    next:'Para la próxima clase',todo:['Observa el cielo durante tres días y anota las nubes.','Trae una foto de lluvia en tu barrio.','Piensa: ¿de dónde viene el agua de tu casa?'],
    ask:'Crea una diapositiva con las tres etapas del ciclo del agua, en tarjetas, y una pregunta para la clase al final.',
    answer:'¡Listo! La diapositiva 2 muestra las tres etapas en tarjetas, cada una con una frase corta, y la 4 tiene una pregunta de opción múltiple que la clase responde con el celular. ¿Agrego una ilustración del ciclo?'},
};

export function sampleDeck(lang:Language):Deck{
  const t=text[lang],deck=newDeck(t.title);
  deck.masters[0]={...deck.masters[0],name:t.master,css,html:''};
  const cover={id:uid('l'),name:t.cover,html:`<section class="slide cover"><div class="wave"></div><h1 data-field="title">${t.title}</h1><p data-field="subtitle">${t.subtitle}</p></section>`};
  const content={id:uid('l'),name:t.content,html:`<section class="slide"><h2 data-field="title">${t.heading}</h2></section>`},blank={id:uid('l'),name:t.blank,html:'<section class="slide"></section>'};
  deck.layouts=[cover,content,blank];
  const slide=(title:string,layoutId:string,html:string,extra:Partial<Slide>={}):Slide=>({id:uid(),title,layoutId,html,css:'',script:'',staticHtml:'',notes:'',...extra});
  deck.slides=[
    slide(t.title,cover.id,cover.html),
    slide(t.stages,content.id,`<section class="slide"><h2 data-field="title">${t.stages}</h2><div class="cards">${t.cards.map(([icon,h,p])=>`<div class="card" data-step><div class="icon">${icon}</div><h3>${h}</h3><p>${p}</p></div>`).join('')}</div></section>`),
    slide('97%',blank.id,`<section class="slide"><div class="big"><b>97%</b><p>${t.fact}</p></div></section>`),
    slide(t.question,blank.id,'<section class="slide"></section>',{poll:{version:1,provider:'edukors',type:'quiz',prompt:t.question,options:t.cards.map(c=>c[1])}}),
    slide(t.next,content.id,`<section class="slide"><h2 data-field="title">${t.next}</h2><ul>${t.todo.map(x=>`<li>${x}</li>`).join('')}</ul></section>`),
  ];
  return deck;
}

// The .esf with the deck and one conversation with the assistant, as the editor saves them.
export const sampleFile=(lang:Language)=>[text[lang].folder,text[lang].title+'.esf'];
export async function writeSample(file:string,lang:Language,account:string){
  const t=text[lang],deck=sampleDeck(lang),{files,manifest}=serialize(deck),at=new Date().toISOString();
  const chat=[{role:'user',text:t.ask,at},{role:'activity',text:'',kind:'launch'},{role:'activity',text:'',kind:'start',detail:'Claude'},{role:'activity',text:'',kind:'thinking'},{role:'activity',text:'',kind:'validating'},{role:'assistant',agent:'Claude',text:t.answer}];
  const conversations={active:'c-store',sessions:[{id:'c-store',title:t.ask,updated:at,chat,profile:account}]};
  await writePackage(file,[{name:'manifest.json',data:JSON.stringify(manifest,null,2)+'\n'},...Object.entries(files).map(([name,data])=>({name,data})),{name:'.edukors/ai/conversations.json',data:JSON.stringify(conversations)}]);
  return deck;
}

// The exported HTML, as File → Export produces it (presenter tools on).
export const exportedHtml=(deck:Deck)=>playerDocument(deck,{title:deck.title+'.html'});
