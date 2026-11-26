import {newDeck,newSlide} from '../src/shared/model';
import {playerDocument} from '../src/shared/player';
import {minifyJs} from '../src/main/minify';
// Exported player with transitions and animations (scripts/test-player-motion.mjs).
const deck=newDeck('Motion');
deck.slides=[newSlide(deck.layouts[0]),newSlide(deck.layouts[0]),newSlide(deck.layouts[0])];
const box=(id:string,attrs:string,left:number)=>`<div id="${id}" ${attrs} style="position:absolute;left:${left}px;top:300px;width:160px;height:160px;background:#4a6cf7;opacity:.8 !important;translate:10px 20px !important">${id}</div>`;
deck.slides[0].html=`<section class="slide"><h1>Motion 1</h1>${box('auto','data-anim-in="fade" data-anim-in-dur="300" data-anim-in-trigger="after" data-anim-in-order="1"',40)}${box('a','data-anim-in="fade" data-anim-in-dur="300" data-anim-in-order="2"',240)}${box('b','data-anim-in="zoom" data-anim-in-dur="300" data-anim-in-trigger="with" data-anim-in-order="3"',440)}${box('c','data-anim-in="up" data-anim-in-dur="300" data-anim-in-trigger="after" data-anim-in-order="4"',640)}${box('d','data-anim-out="dissolve" data-anim-out-dur="300" data-anim-out-order="5"',840)}</section>`;
deck.slides[1].html='<section class="slide"><h1>Motion 2</h1></section>';deck.slides[1].transition={type:'split',duration:600};
deck.slides[2].html=`<section class="slide"><h1>Motion 3</h1><p id="legacy" data-step>Reveal</p>${box('x','data-anim-out="appear" data-anim-out-order="1"',40)}</section>`;deck.slides[2].css='[data-step].pending{opacity:0}';deck.slides[2].transition={type:'up',duration:300};
export const exported=playerDocument(deck,{lang:'en'});
export const minified=playerDocument(deck,{lang:'en',minify:minifyJs});
// A group (two members, data-group-id) that zooms in as one effect, and an object after it.
const groupDeck=newDeck('Group');groupDeck.slides=[newSlide(groupDeck.layouts[0])];
const member=(id:string,left:number,attrs='')=>`<div id="${id}" data-group-id="g1" data-anim-in="zoom" data-anim-in-dur="1500" data-anim-in-trigger="click" data-anim-in-order="1"${attrs} style="position:absolute;left:${left}px;top:300px;width:200px;height:200px;background:#4a6cf7">${id}</div>`;
groupDeck.slides[0].html=`<section class="slide"><h1>Group</h1>${member('m1',200)}${member('m2',600)}<div id="solo" data-anim-in="fade" data-anim-in-order="2" style="position:absolute;left:1000px;top:300px;width:100px;height:100px;background:#000">solo</div></section>`;
export const grouped=playerDocument(groupDeck,{lang:'en'});
