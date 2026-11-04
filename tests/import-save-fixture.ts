import {randomBytes} from 'node:crypto';
import {zipSync,strToU8} from 'fflate';
import {newDeck} from '../src/shared/model';
import {serialize} from '../src/main/projects';
import {createRasterPptx} from '../src/shared/pptx-raster';
export function importFixtures(){
  const deck=newDeck('Legacy import');deck.slides[0].html='<section class="slide"><p data-manual="text">Legacy original</p></section>';
  const {files,manifest}=serialize(deck);
  const esf=zipSync(Object.fromEntries(Object.entries({'manifest.json':JSON.stringify(manifest),...files}).map(([name,data])=>[name,typeof data==='string'?strToU8(data):new Uint8Array(data)])));
  const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64'));
  const pptx=createRasterPptx([png],'PowerPoint import');
  return [{format:'ESF',bytes:Array.from(esf)},{format:'PPTX',bytes:Array.from(pptx)}];
}
// A PowerPoint above Common's 50 MB open limit: one slide whose PNG carries a large private (ignored) chunk of random bytes.
export function largePptx(megabytes=56){
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
  const data=randomBytes(megabytes*2**20),type=Buffer.from('prVt'),length=Buffer.alloc(4);length.writeUInt32BE(data.length);
  const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(Buffer.concat([type,data])));
  const big=Buffer.concat([png.subarray(0,png.length-12),length,type,data,crc,png.subarray(png.length-12)]);
  return createRasterPptx([new Uint8Array(big)],'Large import');
}
function crc32(bytes:Uint8Array){let c=~0;for(const b of bytes){c^=b;for(let k=0;k<8;k++)c=c&1?(c>>>1)^0xedb88320:c>>>1;}return ~c>>>0;}
