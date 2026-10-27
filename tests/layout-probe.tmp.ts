import {newDeck} from '../src/shared/model';
import {slideDocument} from '../src/shared/render';
const deck=newDeck('Layout');const s=deck.slides[0];
s.css='.slide h2{position:absolute;top:40px;left:100px;width:1400px}';
s.poll={version:1,provider:'edukors',type:'post',prompt:'Qual assunto você gostaria de discutir no próximo encontro?'};
export const docs={post:slideDocument(deck,s,true),tag:slideDocument(deck,{...s,poll:{...s.poll,type:'tag',prompt:'Uma palavra?'}},true),quiz:slideDocument(deck,{...s,poll:{version:1,provider:'edukors',type:'quiz',prompt:'Qual assunto você gostaria de discutir no próximo encontro?',options:['A','B','C']}},true)};
