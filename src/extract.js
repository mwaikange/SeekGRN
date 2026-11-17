import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { readProfileSlots } from './form-layout.js';

GlobalWorkerOptions.workerSrc=workerUrl;

async function openPdf(file) {
  if (file.size > 30 * 1024 * 1024) throw new Error('Choose a PDF smaller than 30 MB.');
  return getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false}).promise;
}
const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
function isoDate(value) {
  const parts=value.trim().toLowerCase().split(/\s+/);
  const month=months.indexOf(parts[1])+1;
  if(!month || !/^\d{4}$/.test(parts[2])) return '';
  return parts[2]+'-'+String(month).padStart(2,'0')+'-'+parts[0].padStart(2,'0');
}
export const cleanLines = content => content.split(/\r?\n/).map(line=>line.trim().replace(/\s+/g,' ')).filter(line=>line && !/^Page \d+ of \d+$/i.test(line) && !/^<PARSED TEXT|^PSM CIRCULAR.*VACANCIES IN THE PUBLIC SERVICE|^\s*(\d{1,2} )?[A-Z]+ 20\d{2}$/i.test(line));
function pageLines(items) {
  const byLine=[];
  for(const item of items){
    if(!item.str?.trim())continue;
    const y=item.transform[5];
    let line=byLine.find(row=>Math.abs(row.y-y)<2);
    if(!line){line={y,items:[]};byLine.push(line);}
    line.items.push(item);
  }
  return byLine.sort((a,b)=>b.y-a.y).map(line=>line.items.sort((a,b)=>a.transform[4]-b.transform[4]).map(item=>item.str.trim()).join(' ')).join('\n');
}
const organisation = /^(?:OFFICE OF|MINISTRY OF|MINISTRY:|(?:THE )?MINISTRY OF|PARLIAMENT OF|NATIONAL (?:ASSEMBLY|COUNCIL|PLANNING COMMISSION)|.* REGIONAL COUNCIL|ANTI[- ]CORRUPTION COMMISSION|ELECTORAL COMMISSION OF NAMIBIA|PUBLIC SERVICE COMMISSION|NAMIBIA CENTRAL INTELLIGENCE SERVICE|JUDICIARY|OFFICE OF THE JUDICIARY|AUDITOR[- ]GENERAL|NAMIBIAN POLICE FORCE|NAMIBIA CORRECTIONAL SERVICE)\b[^.:]*$/i;
const roleLine = /^(?:post (?:designation|title)|position)\s*:\s*(.*)$/i;
const roleWithGrade = /^(.{4,110}?)\s+Grade\s+(\d+[A-Z]?)(?:\b.*)$/i;
const fixCase = value => value===value.toUpperCase()?value.toLowerCase().replace(/(^|[\s/-])([a-z])/g,(_,prefix,c)=>prefix+c.toUpperCase()).replace(/\b(Of|The|And|For)\b/g,word=>word.toLowerCase()).replace(/^./,c=>c.toUpperCase()):value;
export function parseCircular(pages) {
  const intro=pages.slice(0,3).join(' ').replace(/\s+/g,' ');
  const issue=intro.match(/PSM\s+CIRCULAR\s+NO\.?\s*([IVXLCDM]+|\d+)\s+OF\s+(\d{4})/i);
  const dates=[...intro.matchAll(/(?:advertised\s+on|closing\s+date)\s*:?\s*(\d{1,2}\s+[a-z]+\s+\d{4})/gi)];
  const title=issue?'PSM Circular No. '+issue[1].toUpperCase()+' of '+issue[2]:'';
  const advertised=isoDate(dates[0]?.[1]??'');
  const closes=isoDate(dates[1]?.[1]??'');
  const jobs=[];
  let org='', unit='', current=null;
  for (const [index,page] of pages.entries()) {
    if(index<3)continue;
    const lines=cleanLines(page);
    for(const [lineIndex,line] of lines.entries()) {
      if (organisation.test(line) && line===line.toUpperCase() && (/[A-Z]/.test(line))) { org=fixCase(line); unit=''; continue; }
      if (/^(department|directorate|division|subdivision|section)\s*:/i.test(line)) {unit=fixCase(line.split(':').slice(1).join(':').trim());continue;}
      const role=line.match(roleLine);
      const graded=line.match(roleWithGrade);
      const nextLine=lines[lineIndex+1]??'';
      if(role?.[1] || (graded && /^(?:\(?\d+\s*[xX]\s*)?(?:posts?\b|duty station\b|salary scale\b)/i.test(nextLine))) {
        const label=(role?.[1]??line).trim();
        const match=label.match(roleWithGrade);
        current={id:'psm-'+(closes||'pending')+'-'+(jobs.length+1),title:fixCase((match?.[1]??label).trim()),grade:match?.[2]??'',org,unit,station:'',page:index+1,details:''};
        jobs.push(current);
        continue;
      }
      if(!current)continue;
      const place=line.match(/^(?:(\d+)\s*[xX×]?\s*posts?|duty\s*station|station|place\s*of\s*work)\s*[:–-]\s*(.+)$/i);
      const salary=line.match(/^Salary(?:\s+Scale)?\s*:\s*(.+)$/i);
      const reference=line.match(/^(?:reference(?:\s*(?:no\.?|number))?|post\s*(?:no\.?|number))\s*:\s*(.+)$/i);
      if(place&&!current.station){current.station=place[2];if(place[1])current.positions=Number(place[1]);}
      if(salary)current.salary=salary[1];
      if(reference)current.reference=reference[1];
      current.details+=(current.details?'\n':'')+line;
    }
  }
  return {title,advertised,closes,jobs};
}
export async function importCircular(file) {
  const pdf=await openPdf(file);
  try {
    const pages=[];
    for(let page=1;page<=pdf.numPages;page++){
      pages.push(pageLines((await (await pdf.getPage(page)).getTextContent()).items));
    }
    const result=parseCircular(pages);
    if(!result.jobs.length)throw new Error('No vacancies could be read. Choose a PSM circular with selectable text.');
    return {...result,pdf:file};
  } finally {await pdf.destroy();}
}
export async function importProfile(file) {
  const pdf=await openPdf(file);
  try {
    const pages=[];
    for(let page=1;page<=Math.min(pdf.numPages,2);page++){
      const source=await pdf.getPage(page);
      pages.push({items:(await source.getTextContent()).items,fields:await source.getAnnotations(),height:source.view[3]});
    }
    const text=pages.map(page=>pageLines(page.items)).join('\n');
    const type=/156094|HEALTH QUESTIONNAIRE|HEALTH QUESTIONAIRE/i.test(text)?'health':/156043|APPLICATION FOR EMPLOYMENT/i.test(text)?'application':'';
    if(!type)throw new Error('Choose a completed GRN form 156043 or 156094 with selectable text.');
    const result=readProfileSlots(pages,type);
    if(!Object.keys(result).length)throw new Error('No completed fields could be read. You can enter your profile manually.');
    return result;
  } finally {await pdf.destroy();}
}
