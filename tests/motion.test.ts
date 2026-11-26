import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newDeck,newSlide,validateDeck} from '../src/shared/model';
import {countSteps,validTransition,clampDuration} from '../src/shared/motion';
import {applySlideChanges} from '../src/shared/assistant';
import {playerDocument} from '../src/shared/player';
import {slideDocument} from '../src/shared/render';

test('Motion: clicks of a slide count data-step reveals and animations started on click',()=>{
  assert.equal(countSteps('<section class="slide"><p data-step>a</p><p data-step data-anim-in="fade">b</p></section>'),2);
  assert.equal(countSteps('<section class="slide"><p data-anim-in="zoom" data-anim-in-trigger="with">a</p><p data-anim-in="up" data-anim-in-trigger="after">b</p><p data-anim-out="fade">c</p></section>'),1);
  assert.equal(countSteps('<section class="slide"><p data-anim-in="nope">a</p><p title="a > b" data-anim-in=\'spin\' data-anim-out="dissolve" data-anim-out-trigger="click">b</p></section>'),2);
  assert.equal(countSteps('<section class="slide"><h1>No motion</h1></section>'),0);
  assert.equal(countSteps('<div data-group-id="g" data-anim-in="fade"></div><div data-group-id="g" data-anim-in="fade"></div><div data-anim-in="zoom"></div>'),2,'a group is one click');
});

test('Motion: slide transitions are validated, and the assistant may set or remove them',()=>{
  assert.ok(validTransition({type:'split',duration:700}));
  for(const bad of [{type:'spin',duration:700},{type:'fade',duration:50},{type:'fade',duration:20000},{type:'fade',duration:1.5},{type:'fade',duration:500,extra:1},null])assert.ok(!validTransition(bad));
  assert.equal(clampDuration(5),100);assert.equal(clampDuration(99999),10000);
  const deck=newDeck('Motion');deck.slides[0].transition={type:'zoom',duration:800};validateDeck(deck);
  assert.throws(()=>validateDeck({...deck,slides:[{...deck.slides[0],transition:{type:'zoom',duration:0} as any}]}),/transition/);
  const set=applySlideChanges(deck,{slideUpdates:[{id:deck.slides[0].id,transition:{type:'left',duration:400}}]})!;
  assert.deepEqual(set.slides[0].transition,{type:'left',duration:400});
  const removed=applySlideChanges(set,{slideUpdates:[{id:deck.slides[0].id,transition:null}]})!;
  assert.equal('transition' in removed.slides[0],false);validateDeck(removed);
});

test('Motion: the player carries transitions and step counts; static documents show every object',()=>{
  const deck=newDeck('Motion');const second=newSlide(deck.layouts[0]);deck.slides.push(second);
  second.html='<section class="slide"><p data-anim-in="fade" data-anim-in-order="1">a</p><p data-step>b</p></section>';second.transition={type:'up',duration:900};
  const html=playerDocument(deck,{lang:'en'});
  assert.match(html,/"transition":\{"type":"up","duration":900\}/);
  assert.match(html,/"steps":2/);
  // Static copies (thumbnails, PDF) and the canvas never hide objects; live documents include the hidden state rule.
  const live=slideDocument(deck,second,false,'t',0);assert.match(live,/\[data-esf-hidden\]\{visibility:hidden!important\}/);
  assert.match(live,/motion|data-anim-/);
});
