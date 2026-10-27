// QR Code Model 2, byte mode, error correction L. Returns a self-contained SVG.
const dataWords=[0,19,34,55,80,108,136,156,194,232,274,324,370,428,461,523,589,647,721,795,861,932,1006,1094,1174,1276,1370,1468,1531,1631,1735,1843,1955,2071,2191,2306,2434,2566,2702,2812,2956];
const eccWords=[0,7,10,15,20,26,18,20,24,30,18,20,24,26,30,22,24,28,30,28,28,28,28,30,30,26,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30];
const blocks=[0,1,1,1,1,1,2,2,2,2,4,4,4,4,4,6,6,6,6,7,8,8,9,9,10,12,12,12,13,14,15,16,17,18,19,19,20,21,22,24,25];
const align=[[],[],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50],
  [6,30,54],[6,32,58],[6,34,62],[6,26,46,66],[6,26,48,70],[6,26,50,74],[6,30,54,78],[6,30,56,82],[6,30,58,86],[6,34,62,90],
  [6,28,50,72,94],[6,26,50,74,98],[6,30,54,78,102],[6,28,54,80,106],[6,32,58,84,110],[6,30,58,86,114],[6,34,62,90,118],
  [6,26,50,74,98,122],[6,30,54,78,102,126],[6,26,52,78,104,130],[6,30,56,82,108,134],[6,34,60,86,112,138],[6,30,58,86,114,142],
  [6,34,62,90,118,146],[6,30,54,78,102,126,150],[6,24,50,76,102,128,154],[6,28,54,80,106,132,158],[6,32,58,84,110,136,162],
  [6,26,54,82,110,138,166],[6,30,58,86,114,142,170]];
function multiply(a:number,b:number){let z=0;for(let i=7;i>=0;i--){z=(z<<1)^((z>>>7)*0x11d);z^=((b>>>i)&1)*a;}return z;}
function remainder(data:number[],degree:number){
  let divisor=[1];for(let i=0,root=1;i<degree;i++,root=multiply(root,2)){const next=Array(divisor.length+1).fill(0);divisor.forEach((v,j)=>{next[j]^=v;next[j+1]^=multiply(v,root);});divisor=next;}
  const result=Array(degree).fill(0);for(const byte of data){const factor=byte^result.shift()!;result.push(0);for(let i=0;i<degree;i++)result[i]^=multiply(divisor[i+1],factor);}return result;
}
export function qrSvg(value:string){
  const bytes=[...new TextEncoder().encode(value)],version=dataWords.findIndex((n,v)=>v>0&&bytes.length<=(n*8-4-(v<10?8:16))/8);if(version<1)throw Error('URL too long for QR code.');
  const bits:number[]=[],push=(n:number,length:number)=>{for(let i=length-1;i>=0;i--)bits.push((n>>>i)&1);};
  push(4,4);push(bytes.length,version<10?8:16);bytes.forEach(b=>push(b,8));
  const capacity=dataWords[version]*8;push(0,Math.min(4,capacity-bits.length));while(bits.length%8)bits.push(0);
  const data:number[]=[];for(let i=0;i<bits.length;i+=8)data.push(parseInt(bits.slice(i,i+8).join(''),2));
  const initial=data.length;for(let i=initial;i<dataWords[version];i++)data.push((i-initial)%2===0?0xec:0x11);
  const count=blocks[version],ecc=eccWords[version],short=Math.floor(data.length/count),long=data.length%count;
  const chunks:number[][]=[],checks:number[][]=[];let at=0;
  for(let i=0;i<count;i++){const length=short+(i>=count-long?1:0),chunk=data.slice(at,at+length);at+=length;chunks.push(chunk);checks.push(remainder(chunk,ecc));}
  const code:number[]=[];for(let i=0;i<short+1;i++)chunks.forEach(c=>{if(i<c.length)code.push(c[i]);});for(let i=0;i<ecc;i++)checks.forEach(c=>code.push(c[i]));
  const size=version*4+17,matrix=Array.from({length:size},()=>Array(size).fill(false) as boolean[]),fixed=Array.from({length:size},()=>Array(size).fill(false) as boolean[]);
  const set=(x:number,y:number,dark:boolean)=>{if(x>=0&&y>=0&&x<size&&y<size){matrix[y][x]=dark;fixed[y][x]=true;}};
  for(const [cx,cy] of [[3,3],[size-4,3],[3,size-4]])for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){const d=Math.max(Math.abs(dx),Math.abs(dy));set(cx+dx,cy+dy,d!==2&&d!==4);}
  const positions=align[version];for(const y of positions)for(const x of positions){if(fixed[y][x])continue;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)set(x+dx,y+dy,Math.max(Math.abs(dx),Math.abs(dy))!==1);}
  for(let i=8;i<size-8;i++){if(!fixed[i][6])set(6,i,i%2===0);if(!fixed[6][i])set(i,6,i%2===0);}
  // Reserve both copies of the format information before placing data.
  for(let i=0;i<9;i++){if(i!==6){set(8,i,false);set(i,8,false);}}
  for(let i=0;i<8;i++){set(size-1-i,8,false);set(8,size-1-i,false);}set(8,size-8,true);
  if(version>=7){let v=version;for(let i=0;i<12;i++)v=(v<<1)^((v>>>11)*0x1f25);const info=(version<<12)|v;for(let i=0;i<18;i++){const bit=((info>>>i)&1)!==0,a=size-11+i%3,b=Math.floor(i/3);set(a,b,bit);set(b,a,bit);}}
  const stream:number[]=[];code.forEach(b=>{for(let i=7;i>=0;i--)stream.push((b>>>i)&1);});let cursor=0;
  for(let right=size-1;right>=1;right-=2){if(right===6)right=5;for(let vert=0;vert<size;vert++){const y=(((right+1)&2)===0)?size-1-vert:vert;for(let j=0;j<2;j++){const x=right-j;if(fixed[y][x])continue;matrix[y][x]=((stream[cursor++]||0)===1)!==((x+y)%2===0);}}}
  const mask=0,formatData=(1<<3)|mask;let rem=formatData;for(let i=0;i<10;i++)rem=(rem<<1)^((rem>>>9)*0x537);const format=((formatData<<10)|rem)^0x5412;
  for(let i=0;i<=5;i++)set(8,i,((format>>>i)&1)!==0);set(8,7,((format>>>6)&1)!==0);set(8,8,((format>>>7)&1)!==0);set(7,8,((format>>>8)&1)!==0);
  for(let i=9;i<15;i++)set(14-i,8,((format>>>i)&1)!==0);
  for(let i=0;i<8;i++)set(size-1-i,8,((format>>>i)&1)!==0);for(let i=8;i<15;i++)set(8,size-15+i,((format>>>i)&1)!==0);set(8,size-8,true);
  const path:string[]=[];matrix.forEach((row,y)=>row.forEach((dark,x)=>{if(dark)path.push(`M${x+1} ${y+1}h1v1h-1z`);}));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size+2} ${size+2}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="white"/><path d="${path.join('')}" fill="black"/></svg>`;
}

// The exported HTML embeds the same generator and its tables, without a remote dependency.
export function qrRuntimeSource(){return `(()=>{const dataWords=${JSON.stringify(dataWords)},eccWords=${JSON.stringify(eccWords)},blocks=${JSON.stringify(blocks)},align=${JSON.stringify(align)};${multiply.toString()};${remainder.toString()};return ${qrSvg.toString()};})()`;}
