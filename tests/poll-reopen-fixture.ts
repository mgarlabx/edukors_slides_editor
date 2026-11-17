import {newDeck,newSlide} from '../src/shared/model';
import {playerDocument} from '../src/shared/player';

const deck=newDeck('Word cloud');
deck.slides=[newSlide(deck.layouts[0]),newSlide(deck.layouts[0])];
deck.slides[0].html='<section class="slide"><h1>Intro</h1></section>';
deck.slides[1].poll={version:1,provider:'edukors',type:'tag',prompt:'Uma palavra sobre IA na educação'};
export const exported=playerDocument(deck,{lang:'pt',pollServer:'https://poll.example.org'});
