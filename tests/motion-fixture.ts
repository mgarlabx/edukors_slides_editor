import {newDeck,newSlide} from '../src/shared/model';
import {playerDocument} from '../src/shared/player';

const deck=newDeck('Motion regression');
deck.slides=[newSlide(deck.layouts[0]),newSlide(deck.layouts[0])];
deck.slides.forEach((slide,i)=>{
  slide.html=`<section class="slide"><h1>Motion ${i+1}</h1><div class="moving">CSS</div><div class="optional">Opt-in CSS</div><p data-step>Step</p><span class="walker">JS</span></section>`;
  slide.css=`@keyframes move{to{transform:translateX(100px)}}
    .moving,.moving::before{animation:move 2s linear infinite}.moving::before{content:'Before'}
    @media(prefers-reduced-motion:reduce){.moving,.moving::before{animation:none!important}}
    @supports(display:grid){@media(prefers-reduced-motion:no-preference){.optional{animation:move 2s linear infinite}}}
    @media(prefers-reduced-motion:reduce),(max-width:2000px){.moving{color:rgb(255,0,0)}}`;
  slide.script=`window.slideBehavior={enter(root){let n=0;const el=root.querySelector('.walker');function move(){el.dataset.tick=String(++n);requestAnimationFrame(move)}move()}};`;
});
export const withTools=playerDocument(deck,{lang:'pt'});
export const withoutTools=playerDocument(deck,{tools:false,lang:'pt'});
