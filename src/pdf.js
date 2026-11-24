import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { addressLines, addressSlots, employmentSlots, identityBaseline, identityBoxCenters, qualificationSlots, schoolCertificateLines, schoolLines, tertiaryLines } from './form-layout.js';
import { vacancyUnitLines } from './circular-parser.js';

function wrap(value, font, size, width) {
 const lines = [];
 let start = 0;
 while (start < value.length) {
  let end = start + 1;
  while (end < value.length && font.widthOfTextAtSize(value.slice(start, end + 1), size) <= width) end++;
  if (end < value.length && value[end] !== ' ') {
   const space = value.lastIndexOf(' ', end - 1);
   if (space > start) end = space;
  }
  lines.push({ value: value.slice(start, end), start });
  start = end + Number(value[end] === ' ');
 }
 return lines;
}

export async function prepareForms(profile, job, circular) {
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Windhoek'}).format(new Date());
 const files=[];
 const additional=[];
 const tidy=value=>String(value||'N/A').replace(/[–—]/g,'-').replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/\s+/g,' ').trim().normalize('NFC');
 for(const type of ['application','health']) {
  const response=await fetch('/'+type+'.pdf');
  if(!response.ok)throw new Error('Unable to load the official template.');
  const doc=await PDFDocument.load(await response.arrayBuffer());
  const font=await doc.embedFont(StandardFonts.Helvetica);
  const pages=doc.getPages();
  function text(page,value,x,y,width=180,size=8) {
   const valueText=tidy(value);
   while(font.widthOfTextAtSize(valueText,size)>width&&size>5)size-=.25;
   if(font.widthOfTextAtSize(valueText,size)>width)throw new Error('Shorten this entry to fit the official form: '+valueText.slice(0,50));
   pages[page].drawText(valueText,{x,y,size,font}); return {valueText,size};
  }
  function twoLines(page,value,x,y,width) {
   const input=tidy(value);
   if (font.widthOfTextAtSize(input,6)<=width) return text(page,input,x,y,width);
   const words=input.split(' ');
   let first=words.shift();
   while(words.length&&font.widthOfTextAtSize(first+' '+words[0],6)<=width) first+=' '+words.shift();
   text(page,first,x,y,width);
   if(words.length) text(page,words.join(' '),x,y-11,width);
  }
  function fit(value, width, lineCount, minimum=6.5) {
   const input = tidy(value);
   let size = 8;
   let lines = wrap(input, font, size, width);
   while (lines.length > lineCount && size > minimum) {
    size -= .25;
    lines = wrap(input, font, size, width);
   }
   return {input, size, lines};
  }
  function drawLines(page, layout, x, baselines, majors='') {
   const {input, size, lines} = layout;
   const ranges = majors.split(',').map(tidy).filter(major=>major&&major!=='N/A').flatMap(major=>{
    const value = input.toLowerCase();
    const term = major.toLowerCase();
    const found = [];
    for (let start=value.indexOf(term);start>=0;start=value.indexOf(term,start+term.length)){
     found.push([start,start+term.length]);
    }
    return found;
   });
   lines.forEach(({value, start}, i)=>{
    const y=baselines[i];
    pages[page].drawText(value,{x,y,size,font});
    for (const [from,to] of ranges) {
     const left=Math.max(from-start,0), right=Math.min(to-start,value.length);
     if (left>=right) continue;
     const xAt=index=>x+font.widthOfTextAtSize(value.slice(0,index),size);
     pages[page].drawLine({start:{x:xAt(left),y:y-.6},end:{x:xAt(right),y:y-.6},thickness:.45});
    }
   });
  }
  function fitField(label, value, width, baselines, majors='') {
   const layout=fit(value,width,baselines.length);
   if(layout.lines.length<=baselines.length)return layout;
   additional.push([label,layout.input,majors]);
   const marker={value:'See addendum',start:layout.input.length};
   return {...layout,lines:[...layout.lines.slice(0,baselines.length-1),marker]};
  }
  function qualification(row, label, baselines) {
   for (const [key,x,width] of qualificationSlots) {
    const majors=key==='subjects'?row.majors||'':'';
    const fieldLines=key==='obtained'?baselines.slice(0,1):key==='certificate'&&baselines===schoolLines?schoolCertificateLines:baselines;
    const names={institution:'Institution',certificate:'Qualification',subjects:'All subjects',obtained:'Month and year obtained'};
    const layout=fitField(label+' - '+names[key],row[key],width,fieldLines,majors);
    drawLines(1,layout,x,fieldLines,majors);
   }
  }
  if(type==='application') {
   twoLines(0,[job.title,job.grade&&'Grade '+job.grade,job.reference&&'Ref. '+job.reference].filter(Boolean).join(' / '),48,576,250);
   const unit=vacancyUnitLines(job).at(-1);
   const ministry=fit(job.org,245,1,6);
   const heading=unit?fit(unit,245,1,5.75):null;
   if(ministry.lines.length>1||heading?.lines.length>1){
    additional.push(['A2 - Office, ministry, agency or regional council',[ministry.input,heading?.input].filter(Boolean).join(' / ')]);
   }
   for(const [layout,y] of [[ministry,576.5],[heading,565.5]]){
    if(!layout)continue;
    if(layout.lines.length>1){
     const suffix='…';
     const [{value}]=wrap(layout.input,font,layout.size,245-font.widthOfTextAtSize(suffix,layout.size));
     layout.lines=[{value:value+suffix,start:0}];
    }
    drawLines(0,layout,334,[y]);
   }
   twoLines(0,job.station,48,543,250);text(0,profile.available,444,554,137);text(0,circular.title,384,532,195);text(0,circular.advertised,356,521,220);
   const slots=[['surname',48,472,380,11],['maiden',48,450,380],['names',48,428,380,11],['birth',265,403,160],['passport',113,382,140],['citizenship',108,371,145],['permit',340,393,90],['home',104,294,100],['mobile',255,294,113],['work',414,294,80],['fax',528,294,52],['email',86,284,280],['faxmail',425,284,155],['alternate',194,273,170],['alternatePhone',456,273,124]];
   slots.forEach(([key,x,y,width,size])=>text(0,profile[key],x,y,width,size));
   const identity=String(profile.identity??'').replace(/[\s-]/g,'');
   if(identity.length>identityBoxCenters.length||/\D/.test(identity))throw new Error('Enter up to 14 digits in the Namibian identity number field.');
   [...identity].forEach((digit,i)=>{
    const x=identityBoxCenters[i]-font.widthOfTextAtSize(digit,8)/2;
    pages[0].drawText(digit,{x,y:identityBaseline,size:8,font});
   });
   for(const [key,[x,width]] of Object.entries(addressSlots)){
    const value=profile[key];
    // Keep intentional address lines when they fit, then try automatic wrapping.
    const parts=String(value??'').split(/\r?\n/).map(v=>v.trim()).filter(Boolean);
    const lines=parts.map(v=>fit(v,width,1));
    if(lines.length===2&&lines.every(l=>l.lines.length===1)){
     lines.forEach((layout,i)=>drawLines(0,layout,x,[addressLines[i]]));
    }else{
     drawLines(0,fitField(key==='postal'?'B7 - Postal address':'B8 - Residential address',value,width,addressLines),x,addressLines);
    }
   }
   text(0,'X',545,profile.gender==='Male'?425:396,12);text(0,'X',545,profile.marital==='Married'?370:338,12);
   text(0,'X',profile.disability==='Yes'?245:312,258,12);
   ['convicted','pending','dismissed','boarded'].forEach((key,i)=>text(0,'X',profile[key]==='Yes'?573:504,[214,201,189,176][i],12));
   employmentSlots.forEach(([key,x,y,w])=>text(0,profile.employmentType==='Yes'?profile[key]:'N/A',x,y,w));
   if(profile.employmentType==='Yes')text(0,'X',profile.probation==='Yes'?305:380,82,12);
   profile.languages.forEach((row,i)=>{const x=130+i*75;if(i)text(1,row.language,x,724,70);['speak','read','write'].forEach((key,j)=>text(1,row[key],x,711-j*13,70));});
   if(Object.values(profile.school).some(Boolean))qualification(profile.school,'E1.1 - School qualification',schoolLines);
   const tertiary=profile.tertiary.filter(row=>Object.values(row).some(Boolean));
   if(tertiary.length){
    // Reflow the dotted subject guides with the rest of the tertiary cells.
    for(const y of [547.8,531.2,514.8]){
     pages[1].drawRectangle({x:260.5,y:y-.6,width:215.5,height:2.3,color:rgb(1,1,1)});
    }
    const needs=tertiary.map(row=>Math.max(...qualificationSlots.filter(([key])=>key!=='obtained').map(([key,,width])=>fit(row[key],width,1).lines.length)));
    const counts=tertiary.map(()=>1);
    let spare=tertiaryLines.length-tertiary.length;
    for(const [index,need] of [...needs.entries()].sort((a,b)=>a[1]-b[1])){
     const extra=Math.min(need-1,spare);
     counts[index]+=extra;
     spare-=extra;
    }
    let start=0;
    tertiary.forEach((row,i)=>{
     qualification(row,'E1.2 - Tertiary qualification '+(i+1),tertiaryLines.slice(start,start+counts[i]));
     start+=counts[i];
    });
   }
   text(1,profile.study,215,499,365);text(1,profile.apprenticeship,272,475,24);text(1,profile.agreement,360,475,53);text(1,profile.training,465,475,115);text(1,profile.statutory,48,436,530);
   profile.experience.forEach((row,i)=>{
    const y=371-i*22;
    text(1,row.employer,48,y,105);text(1,row.post,160,y,100);
    const from=(row.from||'').split('-').reverse();
    [266,298,337].forEach((x,j)=>text(1,from[j]||'-',x,y,28));
    const current=row.current||!row.to;
    if(current)text(1,'Present',370,y,29);
    else{
     const to=row.to.split('-').reverse();
     [370,405,445].forEach((x,j)=>text(1,to[j]||'-',x,y,28));
    }
    text(1,row.reason||(current?'Current role':''),480,y,98);
   });
   text(1,profile.obligations==='Yes'?profile.obligationsDetails:'No',48,225,530);text(1,date,487,166,90);
  } else {
   text(0,profile.surname,161,476,245);text(0,profile.names,108,458,298);text(0,profile.identity,474,476,105);text(0,profile.height,294,436,110);text(0,profile.mass,487,436,90);
   const [year,month,day]=date.split('-').map(Number);
   const [birthYear,birthMonth,birthDay]=profile.birth.split('-').map(Number);
   const birthdayAhead=month<birthMonth||(month===birthMonth&&day<birthDay);
   const age=year-birthYear-Number(birthdayAhead);
   text(0,String(age),112,436,110);
   ['skin','joints','senses','heart','breathing','digestion','urinary','nerves','otherIllness'].forEach((key,i)=>{const page=i<5?0:1,y=[342,282,230,165,113,685,638,591,546][i];text(page,'X',profile[key]==='Yes'?201:259,y,12);if(profile[key]==='Yes')text(page,profile[key+'Details'],296,y,282);});
   text(1,'X',profile.impairment==='Yes'?534:570,486,12);text(1,'X',profile.disability==='Yes'?534:570,462,12);text(1,[profile.impairmentDetails,profile.disabilityDetails].filter(Boolean).join('; '),42,382,530);text(1,'X',profile.surgery==='Yes'?540:573,261,12);text(1,profile.surgeryDetails,42,218,530);text(1,date,418,89,150);
  }
  files.push({label:type==='application'?'Application for employment 156043':'Health questionnaire 156094',name:type+'-'+job.id+'.pdf',blob:new Blob([await doc.save()],{type:'application/pdf'}),viewed:false,shared:false});
 }
 const disclosureLabels={
  convicted:'Criminal convictions',
  pending:'Pending criminal or other cases',
  dismissed:'Dismissal from employment',
  boarded:'Boarding on medical grounds'
 };
 const disclosures=Object.entries(disclosureLabels).filter(([key])=>profile[key]==='Yes');
 if(disclosures.length||additional.length){
  const supplement=await PDFDocument.create();
  const font=await supplement.embedFont(StandardFonts.Helvetica);
  let page=supplement.addPage();
  let y=page.getHeight()-55;
  function write(value,size=11){
   for(const {value:line} of wrap(tidy(value),font,size,490)){
    if(y<55){page=supplement.addPage();y=page.getHeight()-55;}
    page.drawText(line,{x:50,y,size,font});
    y-=size+6;
   }
   y-=10;
  }
  write('Form 156043 | Additional information',16);
  write(profile.names+' '+profile.surname+' / '+job.title+' / '+date);
  for(const [key,label] of disclosures){write(label);write(profile[key+'Details']);}
  for(const [label,value,majors] of additional){write(label);write(value);if(majors)write('Major subjects: '+majors);}
  files.push({label:'Additional information for form 156043',name:'additional-information-'+job.id+'.pdf',blob:new Blob([await supplement.save()],{type:'application/pdf'}),viewed:false,shared:false});
 }
 return {jobId:job.id,title:job.title,org:job.org,date,files};
}
