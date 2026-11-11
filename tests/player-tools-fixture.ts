import {newDeck,newSlide} from '../src/shared/model';
import {playerDocument} from '../src/shared/player';

const deck=newDeck('Player tools');
deck.slides=[newSlide(deck.layouts[0]),newSlide(deck.layouts[0])];
deck.slides.forEach((slide,i)=>{slide.title='Slide '+(i+1);slide.html=`<section class="slide"><h1>Tools ${i+1}</h1></section>`;});
deck.slides[0].notes='First note\nsecond line <b>not markup</b>';
export const exported=playerDocument(deck,{lang:'pt'});
