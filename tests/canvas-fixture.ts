import {newDeck,newSlide} from '../src/shared/model';
export {readDeck,writeDeck} from '../src/main/projects';
export const deck=newDeck('Canvas regression');
const slide=newSlide(deck.layouts[0]);deck.slides=[slide];
const image='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#4275ca"/></svg>');
slide.html=`<section class="slide">
<h2 id="legacy-text">Legacy <span style="color:#b02030">formatted</span> title</h2>
<div id="card"><p id="nested-text">Nested text</p></div>
<img id="photo" src="${image}" alt="Fixture">
<img id="cropped" src="${image}" alt="Cropped" style="clip-path:inset(10% 20% 30% 15%)">
<div id="transformed"><img id="transformed-photo" src="${image}" alt="Transformed"></div>
<div id="centered"><img id="centered-photo" src="${image}" alt="Centered"></div>
<div id="inline-wrapper"><span id="inline-text">Inline object</span></div>
<svg id="vector" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><rect width="200" height="100" fill="#40a575"/><text x="20" y="50">Vector</text></svg>
</section>`;
slide.css=`*{box-sizing:border-box} .slide{width:1600px;height:900px;background:white;padding:0;font:32px Arial}
#legacy-text{position:absolute;left:100px;top:70px;width:650px;margin:0;font:60px Georgia;color:rgb(15,55,95)}.slide{--rise:1s}.slide #legacy-text{animation:rise var(--rise) ease both}.slide.lit #legacy-text{transition:letter-spacing .5s;letter-spacing:2px}@keyframes rise{from{opacity:0}}
#card{position:absolute;left:950px;top:70px;width:400px;height:170px;background:#eee;border:3px solid #aaa;padding:30px}#card p{margin:0}
#photo,#cropped{position:absolute;left:100px;top:300px;width:400px!important;height:200px!important}#cropped{left:650px}
#transformed{position:absolute;left:1100px;top:360px;transform:rotate(20deg) scale(.7,.8);transform-origin:0 0}#transformed-photo{width:300px;height:150px;translate:-10% 5%}
#centered{position:absolute;left:100px;top:580px;width:450px;height:240px;display:flex;align-items:center;justify-content:center}#centered-photo{width:300px;height:150px}
#inline-wrapper{position:absolute;left:650px;top:620px}#vector{position:absolute;left:1050px;top:650px;width:200px;height:100px}`;
slide.staticHtml=slide.html;
// A script animation tied to the title: copied with it (following its new ID) to other slides and presentations.
slide.script=`window.slideBehavior={renderStatic(root){root.querySelector('#legacy-text')?.setAttribute('data-ran','1');}};`;
// A second slide without the first one's CSS: objects copied there must keep their look and place.
const other=newSlide(deck.layouts[0]);other.html='<section class="slide"></section>';other.css='.slide{width:1600px;height:900px;background:#f4f4f4}';other.staticHtml=other.html;deck.slides.push(other);
