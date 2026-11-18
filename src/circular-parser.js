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
 const jobs=[];let org='',unit='',current=null,group=0;const groups=new Map();
 const lines=pages.flatMap((page,i)=>i<4?[]:cleanLines(page).map(text=>({text:tidy(text),page:i+1})));
 for(let i=0;i<lines.length;i++){
  const {text:line,page}=lines[i];const compact=line.replace(/\s/g,'').toUpperCase();
  if(line===line.toUpperCase()&&/^(OFFICE OF |MINISTRY OF |NATIONAL ASSEMBLY|NATIONAL COUNCIL)/.test(line)||/^[A-Z -]+REGIONALCOUNCIL$/.test(compact)){
   org=fixCase(line);unit='';group++;groups.set(group,[]);current=null;continue;
  }
  const heading=line.split(':')[0].replace(/\s/g,'').toLowerCase();
  if(['department','directorate','division','subdivision','section'].includes(heading)){
   unit=line.slice(line.indexOf(':')+1).trim();continue;
  }
  if(['postdesignation','posttitle','position'].includes(heading)){
   let label=line.slice(line.indexOf(':')+1).trim();
   while((label.match(/\(/g)||[]).length>(label.match(/\)/g)||[]).length&&i+1<lines.length&&!/:|salary|minimum|^\d+\s*x/i.test(lines[i+1].text))label+=' '+lines[++i].text;
   const match=label.match(/^(.*?)\s+Grade\s+(\d+[A-Z]?)(.*)$/i);
   current={id:'psm-'+(closes||'pending')+'-'+(jobs.length+1),title:fixCase(match?match[1]+match[3]:label),grade:match?.[2]||'',org,unit,station:'',page,details:'',group};
   jobs.push(current);continue;
  }
  groups.get(group)?.push(line);
  if(!current)continue;
  const place=line.match(/^(?:(\d+)\s*[xX×]?\s*posts?|duty\s*station|station|place\s*of\s*work)\s*[:–-]\s*(.*)$/i);
  if(place&&!current.station){
   let station=place[2];current.positions=Number(place[1]||1);
   while(i+1<lines.length&&!/^(?:salary|scale|minimum|requirements|area of|housing|motor|post|key|supplementary|enquiries)/i.test(lines[i+1].text)) {
    station+=' '+lines[++i].text;
   }
   current.station=station.replace(/^1\s*x\s*/i,'').trim();
  }
  const salary=line.match(/^Salary(?:\s+Scale)?\s*:\s*(.+)$/i);
  if(salary)current.salary=salary[1];
  const ref=line.match(/^(?:reference(?:\s*(?:no\.?|number))?|post\s*(?:no\.?|number))\s*:\s*(.+)$/i);
  if(ref)current.reference=ref[1];
  current.details+=(current.details?'\n':'')+line;
 }
 for(const job of jobs){
  const groupText=(groups.get(job.group)||[]).join('\n');
  const delivery=groupText.match(/(?:Applications must be addressed to|Applications should be addressed to|The Chief Regional Officer|The Executive Director|The Regional Director)[\s\S]*/i);
  if(delivery)job.delivery=delivery[0].slice(0,2400);
  delete job.group;
 }
 const expanded=jobs.flatMap(job=>{
 const stations=job.station.split(/\s*:?\s+\d+\s*[xX]\s*/).map(s=>s.replace(/^\d+\s*[xX]\s*/,'').trim()).filter(Boolean);
 return stations.length>1?stations.map((station,i)=>({...job,id:job.id+'-'+(i+1),station,positions:1})): [job];
});
 return {title:issue?'PSM Circular No. '+issue[1].toUpperCase()+' of '+issue[2]:'',advertised,closes,jobs:expanded};
}
