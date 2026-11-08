// node:test and node:assert/strict for tests bundled into headless Chrome (scripts/test-common-headless.mjs).
const tests:{name:string;fn:()=>unknown}[]=[];
export function test(name:string,fn:()=>unknown){tests.push({name,fn});}
export async function runTests(){const results:{name:string;error?:string}[]=[];for(const t of tests){try{await t.fn();results.push({name:t.name});}catch(e:any){results.push({name:t.name,error:String(e?.stack||e)});}}return results;}
const fail=(message:string)=>{throw Error(message);};
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const assert={
  equal:(a:unknown,b:unknown,m?:string)=>{if(a!==b)fail(m||`Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);},
  notEqual:(a:unknown,b:unknown,m?:string)=>{if(a===b)fail(m||`Expected a different value than ${JSON.stringify(b)}`);},
  deepEqual:(a:unknown,b:unknown,m?:string)=>{if(!same(a,b))fail(m||`Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);},
  ok:(a:unknown,m?:string)=>{if(!a)fail(m||'Expected a true value');},
  match:(a:string,re:RegExp,m?:string)=>{if(!re.test(a))fail(m||`${JSON.stringify(a)} does not match ${re}`);},
  rejects:async(p:Promise<unknown>,re?:RegExp)=>{try{await p;}catch(e:any){if(re&&!re.test(String(e?.message||e)))fail(`Error ${e?.message} does not match ${re}`);return;}fail('Expected a rejection');},
  throws:(fn:()=>unknown,re?:RegExp)=>{try{fn();}catch(e:any){if(re&&!re.test(String(e?.message||e)))fail(`Error ${e?.message} does not match ${re}`);return;}fail('Expected an error');},
};
export default assert;
