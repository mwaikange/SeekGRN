const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
function isoDate(value) {
  const parts=value.trim().toLowerCase().split(/\s+/);
  const month=months.indexOf(parts[1])+1;
  if(!month || !/^\d{4}$/.test(parts[2])) return '';
  return parts[2]+'-'+String(month).padStart(2,'0')+'-'+parts[0].padStart(2,'0');
}
export const cleanLines = content => content.split(/\r?\n/).map(line=>line.trim().replace(/\s+/g,' ')).filter(line=>line && !/^Page \d+ of \d+$/i.test(line) && !/^<PARSED TEXT|^PSM CIRCULAR.*VACANCIES IN THE PUBLIC SERVICE|^\s*(\d{1,2} )?[A-Z]+ 20\d{2}$/i.test(line));
export function pageLines(items) {
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

const tidy=s=>s.replace(/Post s/g,'Posts').replace(/\bW indhoek\b/g,'Windhoek').replace(/\bP osts?\b/g,m=>m.replace(' ','')).replace(/COUNC IL/g,'COUNCIL').replace(/LABOU R/g,'LABOUR').replace(/Gra de/g,'Grade').replace(/A dministrative/g,'Administrative').replace(/P harmacist/g,'Pharmacist').replace(/D istrict/g,'District').replace(/O ffice/g,'Office').replace(/Office r/g,'Officer').trim();
const fixCase=s=>s===s.toUpperCase()?s.toLowerCase().replace(/(^|[\s/-])([a-z])/g,(_,p,c)=>p+c.toUpperCase()).replace(/\b(Of|The|And|For)\b/g,w=>w.toLowerCase()):s;
export function parseCircular(pages) {
 const intro=pages.slice(0,4).join(' ').replace(/\s+/g,' ');
 const issue=intro.match(/PSM\s+CIRCULAR\s+NO\.?\s*([IVXLCDM]+|\d+)\s+OF\s+(\d{4})/i);
 const advertised=isoDate(intro.match(/advertised\s+on\s*:?\s*(\d{1,2}\s+[a-z]+\s+\d{4})/i)?.[1]||'');
 const closes=isoDate(intro.match(/closing\s+date\s*:?\s*(\d{1,2}\s+[a-z]+\s+\d{4})/i)?.[1]||'');
 const jobs=[];let org='',unit='',division='',subdivision='',current=null;
 const lines=pages.flatMap((page,i)=>cleanLines(page).map(text=>({text:tidy(text),page:i+1})));
 for(let i=0;i<lines.length;i++){
  const {text:line,page}=lines[i];const compact=line.replace(/\s/g,'').toUpperCase();
  if(line===line.toUpperCase()&&/^(OFFICE OF |MINISTRY OF |NATIONAL ASSEMBLY|NATIONAL COUNCIL)/.test(line)||/^[A-Z -]+REGIONALCOUNCIL$/.test(compact)){
   org=fixCase(line);unit='';division='';subdivision='';current=null;continue;
  }
  const heading=line.split(':')[0].replace(/[\s-]/g,'').toLowerCase();
  if(line.includes(':')&&['department','directorate','division','subdivision','section'].includes(heading)){
   unit=line.slice(line.indexOf(':')+1).trim();
   if(['department','directorate','division'].includes(heading)){
    division=heading==='division'?unit:'';
    subdivision='';
    if(division){
     const combined=division.match(/^(.*?)(?:\s*[:/|]\s*|\s+)sub[\s-]*division\s*:\s*(.+)$/i);
     if(combined){division=combined[1].trim();subdivision=combined[2].trim();}
    }
   }
   if(heading==='subdivision')subdivision=unit;
   continue;
  }
  if(['postdesignation','posttitle','position'].includes(heading)&&line.includes(':')){
   let label=line.slice(line.indexOf(':')+1).trim();
   while((label.match(/\(/g)||[]).length>(label.match(/\)/g)||[]).length&&i+1<lines.length&&!/:|salary|minimum|^\d+\s*x/i.test(lines[i+1].text))label+=' '+lines[++i].text;
   const match=label.match(/^(.*?)\s+Grade\s+(\d+[A-Z]?)(.*)$/i);
   current={id:'psm-'+(closes||'pending')+'-'+(jobs.length+1),title:fixCase(match?match[1]+match[3]:label),grade:match?.[2]||'',org,unit,division,subdivision,station:'',page,details:''};
   jobs.push(current);continue;
  }
  if(!current)continue;
  const place=line.match(/^(?:(\d+)\s*[xX×]?\s*posts?|duty\s*station|station|place\s*of\s*work)\s*[:–-]\s*(.*)$/i);
  if(place&&!current.station){
   let station=place[2];current.positions=Number(place[1]||1);
   while(i+1<lines.length&&!/^(?:salary|scale|minimum|requirements|area of|housing|motor|post|key|supplementary|enquiries)/i.test(lines[i+1].text)) {
    station+=' '+lines[++i].text;
   }
   current.station=station.trim();
  }
  const salary=line.match(/^Salary(?:\s+Scale)?\s*:\s*(.+)$/i);
  if(salary)current.salary=salary[1];
  const ref=line.match(/^(?:reference(?:\s*(?:no\.?|number))?|post\s*(?:no\.?|number))\s*:\s*(.+)$/i);
  if(ref)current.reference=ref[1];
  current.details+=(current.details?'\n':'')+line;
 }
 const expanded=jobs.flatMap(job=>{
 const segments=job.station.split(/\s*:?\s+(?=\d+\s*[xX]\s*)/);
 if(segments.length<2)return [{...job,station:job.station.replace(/^\d+\s*[xX]\s*/,'')}];
 return segments.map((segment,i)=>{
  const match=segment.match(/^(\d+)\s*[xX]\s*(.*)$/);
  return {...job,id:job.id+'-'+(i+1),station:(match?.[2]??segment).trim(),positions:Number(match?.[1]||1)};
 });
});
 return {title:issue?'PSM Circular No. '+issue[1].toUpperCase()+' of '+issue[2]:'',advertised,closes,jobs:expanded};
}
