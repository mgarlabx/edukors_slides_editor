import {Deck,ImportIssue} from '../shared/model';
import {T} from './i18n';

/** The report is document content. It survives Save/Open and is rendered without trusting HTML from the source. */
export function importReportElement(deck:Deck,t:T,onDismiss?:()=>void):HTMLElement|undefined{
  const report=deck.importReport;
  if(!report)return;
  const root=document.createElement('section');root.className='slides-import-report';root.dataset.importReport='';
  const title=document.createElement('strong');title.textContent=t('pptxImported')+(report.sourceName?' · '+report.sourceName:'');
  const notice=document.createElement('p');notice.textContent=t('pptxImportNotice');root.append(title,notice);
  // The person removes the notices once reviewed (one undo step); they leave the saved file too.
  if(onDismiss){const dismiss=document.createElement('button');dismiss.type='button';dismiss.className='small-button slides-import-dismiss';dismiss.dataset.importDismiss='';dismiss.textContent=t('pptxImportDismiss');dismiss.addEventListener('click',onDismiss);title.after(dismiss);}
  if(!report.issues.length&&!report.omitted)return root;
  const details=document.createElement('details'),summary=document.createElement('summary');
  summary.textContent=t('pptxImportDetails').replace('{n}',String(report.issues.length+report.omitted));details.append(summary);
  const list=document.createElement('ul');
  const labels:Record<string,Parameters<T>[0]>={
    'powerpoint-master-layout-preview':'pptxIssueMasterLayout','page-letterboxed':'pptxIssueAspect',
    'geometry-inherited-or-missing':'pptxIssueGeometry','unsafe-svg-preview':'pptxIssueSvg',
    'picture-crop-preview':'pptxIssueCrop','unsupported-image':'pptxIssueImage',
    'unsupported-object':'pptxIssueObject','powerpoint-motion':'pptxIssueMotion'
  };
  const appendIssue=(issue:ImportIssue)=>{
    const item=document.createElement('li');item.dataset.importIssue=issue.code;
    const slide=issue.slideId?deck.slides.findIndex(slide=>slide.id===issue.slideId):-1;
    const location=[slide>=0?t('slide')+' '+(slide+1):'',issue.objectId?'#'+issue.objectId:''].filter(Boolean).join(' · ');
    item.textContent=(location?location+': ':'')+(labels[issue.code]?t(labels[issue.code]):issue.detail);list.append(item);
  };
  report.issues.slice(0,100).forEach(appendIssue);details.append(list);
  if(report.issues.length>100){
    const more=document.createElement('button');more.type='button';more.textContent=t('pptxImportMore').replace('{n}',String(report.issues.length-100));
    more.addEventListener('click',()=>{report.issues.slice(100).forEach(appendIssue);more.remove();});details.append(more);
  }
  if(report.omitted){const omitted=document.createElement('p');omitted.textContent=t('pptxImportOmitted').replace('{n}',String(report.omitted));details.append(omitted);}
  root.append(details);return root;
}
