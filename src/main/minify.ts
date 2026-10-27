import {minify_sync} from 'terser';

// Exported HTML: minifies runtimes and slide scripts. Top-level names stay (slide scripts may rely on globals);
// on a syntax error, or if the __ESF_*__ placeholders were moved/duplicated, the original code is kept.
const cache=new Map<string,string>();
const marks=(code:string)=>(code.match(/__ESF_[A-Z]+__/g)||[]).sort().join();
export function minifyJs(code:string){
  const hit=cache.get(code);if(hit!==undefined)return hit;
  let out=code;try{const r=minify_sync(code,{ecma:2020,compress:{passes:2},mangle:true,format:{comments:false}}).code;if(r!==undefined&&marks(r)===marks(code))out=r;}catch{}
  if(cache.size>400)cache.clear();cache.set(code,out);return out;
}
