// Help: the quick guide (a few steps and the shortcuts), the full teacher's guide and the terms of use (the MIT license,
// explained), in the interface's language, from src/ui/help/*.md. The terms are also shown before anything else until
// the person accepts the current version (TERMS_VERSION). A small Markdown subset is enough for these texts.
import React from 'react';
import {Language} from '../shared/model';
import termsPt from './help/terms-of-use.md';
import termsEn from './help/terms-of-use.en.md';
import termsEs from './help/terms-of-use.es.md';
import guidePt from './help/guide.md';
import guideEn from './help/guide.en.md';
import guideEs from './help/guide.es.md';
const terms:Record<Language,string>={pt:termsPt,en:termsEn,es:termsEs},guides:Record<Language,string>={pt:guidePt,en:guideEn,es:guideEs};
type Link=(url:string)=>void;
// Bold, italic, code and links; links open in the browser (onLink), never in the window.
function inline(text:string,onLink:Link):React.ReactNode[]{
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|\*[^*\s][^*]*\*)/).map((part,i)=>{
    if(/^\*\*.+\*\*$/.test(part))return <strong key={i}>{inline(part.slice(2,-2),onLink)}</strong>;
    if(/^`.+`$/.test(part))return <code key={i}>{part.slice(1,-1)}</code>;
    const link=/^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if(link)return <a key={i} href={link[2]} onClick={e=>{e.preventDefault();onLink(link[2]);}}>{inline(link[1],onLink)}</a>;
    if(/^\*[^*\s].*\*$/.test(part))return <em key={i}>{part.slice(1,-1)}</em>;
    return part;
  });
}
const cells=(row:string)=>row.trim().replace(/^\||\|$/g,'').split('|').map(c=>c.trim());
export function Markdown({text,onLink,title=true}:{text:string;onLink:Link;title?:boolean}){
  const blocks=text.trim().split(/\n\s*\n/);
  return <div className="help-text">{blocks.map((b,i)=>{
    const h=/^(#{1,3}) (.*)$/.exec(b);
    if(h)return h[1].length===1?title?<h1 key={i}>{h[2]}</h1>:null:h[1].length===2?<h2 key={i}>{h[2]}</h2>:<h3 key={i}>{h[2]}</h3>;
    if(b.startsWith('- '))return <ul key={i}>{b.split(/\n(?=- )/).map((x,j)=><li key={j}>{inline(x.slice(2).replace(/\n\s*/g,' '),onLink)}</li>)}</ul>;
    if(/^\d+\. /.test(b))return <ol key={i}>{b.split(/\n(?=\d+\. )/).map((x,j)=><li key={j}>{inline(x.replace(/^\d+\. /,'').replace(/\n\s*/g,' '),onLink)}</li>)}</ol>;
    if(b.startsWith('|')){const [head,,...rows]=b.split('\n');return <table key={i}><thead><tr>{cells(head).map((c,j)=><th key={j}>{inline(c,onLink)}</th>)}</tr></thead><tbody>{rows.map((r,j)=><tr key={j}>{cells(r).map((c,k)=><td key={k}>{inline(c,onLink)}</td>)}</tr>)}</tbody></table>;}
    if(b.startsWith('>'))return <blockquote key={i}>{b.split(/\n>\s*\n/).map((x,j)=><p key={j}>{x.replace(/^>\s?/gm,'').replace(/\n/g,' ')}</p>)}</blockquote>;
    return <p key={i}>{inline(b.replace(/\n/g,' '),onLink)}</p>;
  })}</div>;
}
export const TermsText=({lang,onLink,title}:{lang:Language;onLink:Link;title?:boolean})=><Markdown text={terms[lang]||termsEn} onLink={onLink} title={title}/>;
export const GuideText=({lang,onLink}:{lang:Language;onLink:Link})=><Markdown text={guides[lang]||guideEn} onLink={onLink}/>;
