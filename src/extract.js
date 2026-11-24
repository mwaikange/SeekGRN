import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { readProfileSlots } from './form-layout.js';
import {parseCircular,pageLines} from './circular-parser.js';

GlobalWorkerOptions.workerSrc=workerUrl;

async function openPdf(file) {
  if (file.size > 30 * 1024 * 1024) throw new Error('Choose a PDF smaller than 30 MB.');
  return getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false}).promise;
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
    const templateResponse=await fetch('/'+type+'.pdf');
    if(!templateResponse.ok)throw new Error('Unable to load the reference template.');
    const template=await getDocument({data:new Uint8Array(await templateResponse.arrayBuffer()),isEvalSupported:false}).promise;
    try{
      for(let i=0;i<pages.length;i++){
       const blankItems=(await(await template.getPage(i+1)).getTextContent()).items;
       pages[i].items=pages[i].items.filter(item=>!blankItems.some(blank=>blank.str===item.str&&Math.abs(blank.transform[4]-item.transform[4])<1&&Math.abs(blank.transform[5]-item.transform[5])<1));
      }
    }finally{await template.destroy();}
    const result=readProfileSlots(pages,type);
    if(!Object.keys(result).length)throw new Error('No completed fields could be read. You can enter your profile manually.');
    return result;
  } finally {await pdf.destroy();}
}
