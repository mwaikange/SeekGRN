import { PDFDocument, StandardFonts } from 'pdf-lib';
export async function prepareForms(profile, job, circular) {
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Windhoek'}).format(new Date());
 const files=[];
 const tidy=value=>String(value||'N/A').replace(/[–—]/g,'-').replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/\s+/g,' ').trim().normalize('NFC');
 for(const type of ['application','health']) {
  const response=await fetch('/'+type+'.pdf');
  if(!response.ok)throw new Error('Unable to load the official template.');
  const doc=await PDFDocument.load(await response.arrayBuffer());
  const font=await doc.embedFont(StandardFonts.Helvetica);
  const pages=doc.getPages();
  function text(page,value,x,y,width=180) {
   const valueText=tidy(value);
   let size=8;
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
  if(type==='application') {
   twoLines(0,[job.title,job.grade&&'Grade '+job.grade,job.reference&&'Ref. '+job.reference].filter(Boolean).join(' / '),48,576,250);twoLines(0,job.org,334,576,245);twoLines(0,job.station,48,543,250);text(0,profile.available,444,554,137);text(0,circular.title,384,532,195);text(0,circular.advertised,356,521,220);
   const slots=[['surname',48,472,380],['maiden',48,450,380],['names',48,428,380],['identity',48,403,206],['birth',265,403,160],['passport',113,382,140],['citizenship',108,371,145],['permit',340,393,90],['postal',48,345,205],['residential',266,345,160],['home',104,294,100],['mobile',255,294,113],['work',414,294,80],['fax',528,294,52],['email',86,284,280],['faxmail',425,284,155],['alternate',194,273,170],['alternatePhone',456,273,124]];
   slots.forEach(([key,x,y,w])=>text(0,profile[key],x,y,w));
   text(0,'X',545,profile.gender==='Male'?425:396,12);text(0,'X',545,profile.marital==='Married'?370:338,12);
   text(0,'X',profile.disability==='Yes'?245:312,258,12);
   ['convicted','pending','dismissed','boarded'].forEach((key,i)=>text(0,'X',profile[key]==='Yes'?573:504,[214,201,189,176][i],12));
   if(profile.employmentType==='Yes') [['ministry',208,128,150],['station',430,128,150],['designation',117,117,240],['grade',408,117,172],['appointment',251,106,300],['scale',111,95,246],['notch',428,95,150]].forEach(([key,x,y,w])=>text(0,profile[key],x,y,w));
   else text(0,'N/A',210,128,140);
   if(profile.employmentType==='Yes')text(0,'X',profile.probation==='Yes'?305:380,82,12);
   profile.languages.forEach((row,i)=>{const x=130+i*75;if(i)text(1,row.language,x,724,70);['speak','read','write'].forEach((key,j)=>text(1,row[key],x,711-j*13,70));});
   [profile.school,...profile.tertiary].forEach((row,i)=>{const y=i?536-(i-1)*12:595;[['institution',48,108],['certificate',171,79],['subjects',262,211],['obtained',490,90]].forEach(([key,x,w])=>{const drawn=text(1,row[key],x,y,w);if(key==='subjects'&&row.majors){for(const major of row.majors.split(',').map(v=>v.trim()).filter(Boolean)){const start=drawn.valueText.toLowerCase().indexOf(major.toLowerCase());if(start>=0){const left=x+font.widthOfTextAtSize(drawn.valueText.slice(0,start),drawn.size);pages[1].drawLine({start:{x:left,y:y-1},end:{x:left+font.widthOfTextAtSize(drawn.valueText.slice(start,start+major.length),drawn.size),y:y-1},thickness:.5});}}}});});
   text(1,profile.study,215,499,365);text(1,profile.apprenticeship,272,475,24);text(1,profile.agreement,360,475,53);text(1,profile.training,465,475,115);text(1,profile.statutory,48,436,530);
   profile.experience.forEach((row,i)=>{const y=371-i*22;text(1,row.employer,48,y,105);text(1,row.post,160,y,100);const f=(row.from||'').split('-').reverse(),t=(row.to||'').split('-').reverse();[266,298,337].forEach((x,j)=>text(1,f[j]||'-',x,y,28));[370,405,445].forEach((x,j)=>text(1,t[j]||'-',x,y,28));text(1,row.reason,480,y,98);});
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
 if(disclosures.length){
  const supplement=await PDFDocument.create();
  const font=await supplement.embedFont(StandardFonts.Helvetica);
  let page=supplement.addPage();
  let y=page.getHeight()-55;
  function write(value,size=11){
   for(const word of tidy(value).split(' ')){
    if(font.widthOfTextAtSize(word,size)>490) throw new Error('Use spaces to separate long words in the additional information.');
   }
   const lines=[''];
   for(const word of tidy(value).split(' ')){
    const next=[lines.at(-1),word].filter(Boolean).join(' ');
    if(font.widthOfTextAtSize(next,size)>490) lines.push(word);
    else lines[lines.length-1]=next;
   }
   for(const line of lines){
    if(y<55){page=supplement.addPage();y=page.getHeight()-55;}
    page.drawText(line,{x:50,y,size,font});
    y-=size+6;
   }
   y-=10;
  }
  write('Form 156043 | Additional information',16);
  write(profile.names+' '+profile.surname+' / '+job.title+' / '+date);
  for(const [key,label] of disclosures){write(label);write(profile[key+'Details']);}
  files.push({label:'Additional information for form 156043',name:'additional-information-'+job.id+'.pdf',blob:new Blob([await supplement.save()],{type:'application/pdf'}),viewed:false,shared:false});
 }
 return {jobId:job.id,title:job.title,org:job.org,date,files};
}
