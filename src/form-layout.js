const ignored=/^(?:N\/A|-|[.\s]+)$/i;
export function readProfileSlots(pages,type='application') {
 const p={};
 const at=(page,x,y,width)=>{const value=(pages[page]?.items||[]).filter(i=>Math.abs(i.transform[5]-y)<3&&i.transform[4]>=x-1&&i.transform[4]<x+width).sort((a,b)=>a.transform[4]-b.transform[4]).map(i=>i.str).join(' ').trim();return value&&!ignored.test(value)?value:'';};
 const set=(key,page,x,y,width)=>{const v=at(page,x,y,width);if(v)p[key]=v;};
 const yes=(key,page,y,xYes,xNo)=>{if(/^[x✓]$/i.test(at(page,xYes,y,12)))p[key]='Yes';else if(/^[x✓]$/i.test(at(page,xNo,y,12)))p[key]='No';};
 if(type==='application'){
 const slots=[['surname',48,472,380],['maiden',48,450,380],['names',48,428,380],['identity',48,403,206],['birth',265,403,160],['passport',113,382,140],['citizenship',108,371,145],['permit',340,393,90],['postal',48,345,205],['residential',266,345,160],['home',104,294,100],['mobile',255,294,113],['work',414,294,80],['fax',528,294,52],['email',86,284,280],['faxmail',425,284,155],['alternate',194,273,170],['alternatePhone',456,273,124],['available',444,554,137]];
 for(const [k,x,y,w] of slots)set(k,0,x,y,w);
 if(at(0,545,425,12)==='X')p.gender='Male';else if(at(0,545,396,12)==='X')p.gender='Female';
 if(at(0,545,370,12)==='X')p.marital='Married';else if(at(0,545,338,12)==='X')p.marital='Single';
 yes('disability',0,258,245,312);
 ['convicted','pending','dismissed','boarded'].forEach((k,i)=>yes(k,0,[214,201,189,176][i],573,504));
 [['ministry',208,128,150],['station',430,128,150],['designation',117,117,240],['grade',408,117,172],['appointment',251,106,300],['scale',111,95,246],['notch',428,95,150]].forEach(([k,x,y,w])=>set(k,0,x,y,w));
 p.employmentType=p.ministry?'Yes':'No';
 p.languages=[];
 for(let i=0;i<6;i++){const x=130+i*75;const row={language:i?at(1,x,724,70):'English'};['speak','read','write'].forEach((k,j)=>row[k]=at(1,x,711-j*13,70));if(row.speak||row.read||row.write)p.languages.push(row);}
 if(!p.languages.length)delete p.languages;
 const qualification=y=>Object.fromEntries([['institution',48,108],['certificate',171,79],['subjects',262,211],['obtained',490,90]].map(([k,x,w])=>[k,at(1,x,y,w)]));
 const school=qualification(595);if(school.institution||school.certificate)p.school=school;
 const tertiary=[];for(let i=0;i<3;i++){const row=qualification(536-i*12);if(row.institution||row.certificate)tertiary.push(row);}if(tertiary.length)p.tertiary=tertiary;
 [['study',215,499,365],['apprenticeship',272,475,24],['agreement',360,475,53],['training',465,475,115],['statutory',48,436,530]].forEach(([k,x,y,w])=>set(k,1,x,y,w));
 const experience=[];for(let i=0;i<5;i++){const y=371-i*22;const row={employer:at(1,48,y,105),post:at(1,160,y,100),reason:at(1,480,y,98)};const date=xs=>xs.map(x=>at(1,x,y,28)).reverse().join('-');row.from=date([266,298,337]);row.to=date([370,405,445]);if(row.employer||row.post)experience.push(row);}if(experience.length)p.experience=experience;
 }else{
 [['surname',161,476,245],['names',108,458,298],['identity',474,476,105],['height',294,436,110],['mass',487,436,90]].forEach(([k,x,y,w])=>set(k,0,x,y,w));
 ['skin','joints','senses','heart','breathing','digestion','urinary','nerves','otherIllness'].forEach((k,i)=>{const page=i<5?0:1,y=[342,282,230,165,113,685,638,591,546][i];yes(k,page,y,201,259);set(k+'Details',page,296,y,282);});
 yes('impairment',1,486,534,570);yes('disability',1,462,534,570);yes('surgery',1,261,540,573);
 set('disabilityDetails',1,42,382,530);set('surgeryDetails',1,42,218,530);
 }
 for(const page of pages)for(const f of page.fields||[]){const key=String(f.fieldName||'').replace(/^profile\./,'');if(['surname','names','identity','birth','email','mobile','height','mass'].includes(key)&&f.fieldValue)p[key]=String(f.fieldValue);}
 return p;
}
