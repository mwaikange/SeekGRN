import './style.css';
import { icon } from './icons.js';
import { seed, displayDate, expired, retired } from './circular.js';
import * as fields from './profile.js';
import { get, put, remove } from './storage.js';

async function initialize() {
const root = document.querySelector('#app');
const blank = fields.blankProfile();
const nav = [['browse','grid','Browse vacancies'],['profile','user','My profile'],['documents','file','My documents']];
const state = {
  view: 'browse', section: 'personal', profile: {...blank,...await get('profile')},
  documents: await get('documents') ?? [], circular: await get('circular') ?? seed,
  admin: false, query: '', org: '', station: '', selected: '', notice: '', jobStatus: '', pending: null
};
const circularUrl = new URL('/circular.pdf', location.origin);
const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const action = (label, name, symbol, classes='button secondary', props='') =>
  '<button type="button" class="'+classes+'" data-action="'+name+'" '+props+'>'+(symbol?icon(symbol):'')+escape(label)+'</button>';
const navLink = ([id,symbol,label]) => '<a href="#'+id+'" class="nav-link '+(state.view===id?'active':'')+'" '+(state.view===id?'aria-current="page"':'')+'>'+icon(symbol)+escape(label)+'</a>';
const prepared = id => state.documents.find(bundle=>bundle.jobId===id);
const confirmed = () => state.profile.confirmed && !fields.problems(state.profile).length;
const status = message => {state.notice=message; const el=root.querySelector('#notice'); if(el){el.textContent=message;el.hidden=!message;}};
function retireCircular() {
  if (!retired(state.circular) || state.circular.archived) return;
  state.circular = {...state.circular,jobs:[],pdf:null,archived:true};
  if (state.circular !== seed) void put('circular',state.circular).catch(()=>{});
}
retireCircular();

function shell(content) {
  return '<a class="skip" href="#main">Skip to content</a><header class="mast"><div class="wrap mast-inner">'+
    '<a class="brand" href="#browse"><span class="brand-icon">'+icon('briefcase',23)+'</span><span>Seek<span class="brand-grn">GRN</span>Jobs<small>NAMIBIA PUBLIC SERVICE VACANCIES</small></span></a>'+
    '<nav aria-label="Main navigation">'+nav.map(navLink).join('')+(state.admin?navLink(['admin','upload','Upload PSM']):'')+'</nav>'+
    action(state.admin?'Exit admin preview':'Admin preview','admin-mode','shield','button quiet mast-action')+'</div></header>'+
    '<main id="main">'+content+'<p id="notice" role="status" class="notice wrap" '+(state.notice?'':'hidden')+'>'+escape(state.notice)+'</p></main>'+
    '<footer class="wrap footer"><a class="footer-brand" href="#browse">SeekGRNJobs</a><p>Independent application preparation tool for Namibia’s Public Service.</p></footer>';
}
function sectionHeading(label, title, subtitle) {
  return '<div class="page-head"><span class="eyebrow">'+escape(label)+'</span><h1>'+escape(title)+'</h1><p>'+escape(subtitle)+'</p></div>';
}
function filterOptions(key, label) {
  const values=[...new Set(state.circular.jobs.map(job=>job[key]).filter(Boolean))].sort();
  return '<select aria-label="'+label+'" data-filter="'+key+'"><option value="">'+label+'</option>'+values.map(value=>'<option '+(state[key]===value?'selected':'')+'>'+escape(value)+'</option>').join('')+'</select>';
}
function browse() {
  const c=state.circular;
  const link = c.pdf ? URL.createObjectURL(c.pdf) : c===seed && !c.archived ? circularUrl.href : '';
  return '<div class="wrap"><section class="hero"><div class="hero-art" aria-hidden="true"><i></i><i></i><i></i></div><div class="hero-main"><span class="eyebrow"><span class="signal"></span> NAMIBIA PUBLIC SERVICE</span>'+
    '<h1>Find your next<br><em>public service role.</em></h1><p>Explore vacancies from the PSM circular and prepare the official application forms using your saved profile.</p></div>'+
    '<div class="issue"><span class="issue-icon">'+icon('file',24)+'</span><span class="eyebrow">CURRENT CIRCULAR</span><strong>'+escape(c.title)+'</strong>'+
    '<span class="issue-date">'+icon('clock',16)+(c.archived?'Archived':(expired(c)?'Closed ':'Closes ')+displayDate(c.closes))+'</span>'+
    (link?'<a href="'+escape(link)+'" target="_blank" rel="noopener">Read circular '+icon('external',15)+'</a>':'')+'</div></section>'+
    '<div class="workbench"><section class="vacancies"><div class="area-title"><h2>Browse vacancies</h2><span class="count" id="count"></span></div>'+
    '<div class="filters"><label class="search">'+icon('search')+'<input aria-label="Search vacancies" placeholder="Search by job title or ministry" value="'+escape(state.query)+'" data-filter="query"></label>'+filterOptions('org','All ministries')+filterOptions('station','All duty stations')+'</div>'+
    '<div id="jobs" class="job-list"></div></section><aside class="guide"><div class="guide-icon">'+icon('user',23)+'</div><h2>Your applicant profile</h2><p>Enter your details once and reuse them for each set of government application forms.</p>'+
    '<a class="button primary" href="#profile">'+(confirmed()?'View profile':'Set up my profile')+icon('arrow',16)+'</a><hr>'+
    '<div class="guide-note">'+icon('shield',19)+'<p>Your documents stay in this browser. Submit your signed forms and supporting documents via the Human Resources office listed in the circular.</p></div></aside></div></div>';
}
function renderJobs() {
  const list=root.querySelector('#jobs');
  if (!list) return;
  const c=state.circular;
  const query=state.query.trim().toLocaleLowerCase();
  const jobs=c.jobs.filter(j=>(!state.org||j.org===state.org)&&(!state.station||j.station===state.station)&&[j.title,j.org,j.unit,j.station,j.reference,j.grade].some(x=>String(x??'').toLocaleLowerCase().includes(query)));
  root.querySelector('#count').textContent=jobs.length+' '+(jobs.length===1?'vacancy':'vacancies');
  list.innerHTML=jobs.length?jobs.map(j=>{
    const done=prepared(j.id);
    const expanded=state.selected===j.id;
    const record=['requirements','duties','contact','delivery','details'].filter(k=>j[k]).map(k=>'<div><h3>'+({requirements:'Requirements',duties:'Responsibilities',contact:'Enquiries',delivery:'Where to submit',details:'Circular listing'})[k]+'</h3><p>'+escape(j[k])+'</p></div>').join('');
    return '<article class="job"><div class="job-main"><span class="job-icon">'+icon('building',23)+'</span><div class="job-copy"><div class="job-tags"><span class="tag">'+escape(j.grade?'Grade '+j.grade:'Public service')+'</span>'+ (j.reference?'<span class="tag muted">'+escape(j.reference)+'</span>':'')+'</div>'+
      '<h3><button type="button" class="title-link" aria-expanded="'+expanded+'" data-action="details" data-id="'+escape(j.id)+'">'+escape(j.title)+'</button></h3><p class="job-org">'+escape(j.org)+'</p>'+
      '<p class="job-meta">'+(j.station?'<span>'+icon('pin',15)+escape(j.station)+'</span>':'')+'<span>'+icon('clock',15)+(expired(c)?'Closed ':'Closes ')+displayDate(c.closes)+'</span></p></div>'+
      '<div class="job-action">'+(done?action('View forms','view-bundle','file','button secondary','data-id="'+escape(j.id)+'"'):action(state.pending===j.id?state.jobStatus:expired(c)?'Closed':'Prepare forms','prepare','arrow','button secondary','data-id="'+escape(j.id)+'" '+(expired(c)||state.pending?'disabled':'')))+'</div></div>'+
      (expanded?'<div class="job-detail"><div class="job-extra"><span>'+escape(j.unit)+'</span><strong>'+escape(j.salary)+'</strong></div>'+record+(j.page?'<p class="source">Circular page '+escape(j.page)+'</p>':'')+'</div>':'')+'</article>';
  }).join(''):'<div class="empty">'+icon('search',28)+'<h3>'+ (c.archived?'This circular has been archived':'No matching vacancies')+'</h3><p>'+(c.archived?'New vacancies will appear when the next circular is published.':'Try a different search or clear the ministry and duty station filters.')+'</p></div>';
}
function input(section,key,label,type,value) {
  const attrs=' data-field="'+escape(key)+'" data-section="'+escape(section)+'"';
  let control;
  const choices=type===true?['Yes','No']:type;
  if (Array.isArray(choices)) control='<select'+attrs+'><option value="">Select</option>'+choices.map(x=>'<option '+(value===x?'selected':'')+'>'+escape(x)+'</option>').join('')+'</select>';
  else if (type==='textarea') control='<textarea'+attrs+'>'+escape(value)+'</textarea>';
  else control='<input'+attrs+' type="'+(type??'text')+'" value="'+escape(value)+'">';
  return '<label class="field"><span>'+escape(label)+'</span>'+control+'</label>';
}
const grid = content => '<div class="field-grid">'+content+'</div>';
function fieldGrid(rows, values=state.profile, section='profile') {
  return grid(rows.map(([key,label,type])=>input(section,key,label,type,values[key])).join(''));
}
function question([key,label]) {
  return '<div class="question">'+input('profile',key,label,true,state.profile[key])+(state.profile[key]==='Yes'?input('profile',key+'Details','Details','textarea',state.profile[key+'Details']):'')+'</div>';
}
function repeaters(kind, rows, label, limit, keepFirst=false) {
  const p=state.profile;
  return p[kind].map((row,i)=>'<section class="repeater"><div class="repeat-head"><h3>'+label+' '+(i+1)+'</h3>'+
    (!keepFirst||i?action('Remove','remove-row','close','button quiet','data-kind="'+kind+'" data-index="'+i+'"'):'')+'</div>'+fieldGrid(rows,row,kind+'.'+i)+'</section>').join('')+
    (p[kind].length<limit?action('Add '+label.toLowerCase(),'add-row',null,'button secondary','data-kind="'+kind+'"'):'');
}
function profileContent() {
  const p=state.profile;
  switch(state.section) {
    case 'employment': return fieldGrid([['employmentType','Are you currently employed in the Public Service?',true]])+(p.employmentType==='Yes'?fieldGrid(fields.employment):'');
    case 'qualifications': return '<h3>Highest school qualification</h3>'+fieldGrid(fields.qualifications,p.school,'school')+'<h3>Universities, colleges and other institutions</h3>'+repeaters('tertiary',fields.qualifications,'Qualification',8)+
      '<h3>Further study and registration</h3>'+fieldGrid(fields.otherQualifications)+'<h3>Language proficiency</h3>'+repeaters('languages',fields.languages,'Language',6,true);
    case 'experience': return '<p class="subtle">Enter the most relevant roles. The template provides four labelled rows and space for a fifth entry.</p>'+repeaters('experience',fields.experience,'Role',5);
    case 'health': return '<p class="subtle">Answer each question. For a Yes answer, describe the condition, severity, date and duration as applicable.</p>'+fieldGrid([['height','Height (cm)','number'],['mass','Body mass (kg)','number']])+fields.health.map(question).join('');
    case 'review': {
      const warnings=fields.problems(p);
      return fields.disclosures.map(question).join('')+'<div class="confirm-box"><h3>Confirm your profile</h3><p>Review the details you entered. Sign the application and health declaration when you prepare each pair of forms.</p>'+
        (warnings.length?'<ul>'+warnings.map(w=>'<li>'+escape(w)+'</li>').join('')+'</ul>':'')+
        action(p.confirmed?'Profile confirmed':'Confirm profile','confirm','check','button primary',p.confirmed?'disabled':'')+'</div>';
    }
    default: return '<div class="import-box"><div>'+icon('upload',23)+'<div><strong>Import a completed form</strong><p>Extract text from a previously filled application or health PDF, then review each entry.</p></div></div><label class="button secondary file-picker">Choose PDF<input type="file" data-upload="profile" accept="application/pdf,.pdf"></label></div>'+fieldGrid(fields.personal);
  }
}
function profile() {
  return '<section class="wrap">'+sectionHeading('APPLICANT PROFILE','My profile','Save your details for future application forms.')+
    '<div class="page-grid"><aside class="panel side-steps"><div class="profile-state">'+icon(confirmed()?'check':'user')+(confirmed()?'Confirmed profile':'Profile draft')+'</div>'+
    fields.sections.map(([id,label])=>action(label,'profile-section',null,state.section===id?'step active':'step','data-id="'+id+'"')).join('')+
    action('Clear profile and documents','clear','close','button quiet clear')+'</aside><div class="panel form-panel"><h2>'+fields.sections.find(([id])=>id===state.section)[1]+'</h2>'+profileContent()+
    '<div class="form-footer"><span>'+icon('shield',16)+' Stored in this browser</span>'+action('Save and continue','save','arrow','button primary')+'</div></div></div></section>';
}
function documents() {
  return '<section class="wrap">'+sectionHeading('APPLICATION PACKS','My documents','View, download or share the forms you prepared for each vacancy.')+
    (state.documents.length?'<div class="document-list">'+state.documents.map(bundle=>'<article class="panel document" id="bundle-'+escape(bundle.jobId)+'"><div class="area-title"><h2>'+escape(bundle.title)+'</h2><span class="tag">'+displayDate(bundle.date)+'</span></div><p>'+escape(bundle.org)+'</p>'+
      bundle.files.map((file,i)=>'<div class="document-row"><span class="job-icon">'+icon('file')+'</span><div class="doc-label"><strong>'+escape(file.label)+'</strong><p>'+escape([file.viewed?'Viewed':'Ready',file.shared?'Shared':''].filter(Boolean).join(' · '))+'</p></div>'+
      action('View','open-doc','external','button quiet','data-id="'+escape(bundle.jobId)+'" data-index="'+i+'"')+
      action('Download','download','download','button secondary','data-id="'+escape(bundle.jobId)+'" data-index="'+i+'"')+
      action('Share','share','share','button secondary','data-id="'+escape(bundle.jobId)+'" data-index="'+i+'"')+'</div>').join('')+
      '<p class="subtle">Print and sign both forms. Attach your CV and certified supporting documents, then follow the circular’s delivery instructions.</p>'+
      action('Remove pack','remove-pack','close','button quiet','data-id="'+escape(bundle.jobId)+'"')+'</article>').join('')+'</div>':'<div class="empty panel">'+icon('file',32)+'<h2>No application packs yet</h2><p>Choose a vacancy and select Prepare forms to create your two PDFs.</p><a class="button primary" href="#browse">Browse vacancies '+icon('arrow',16)+'</a></div>')+'</section>';
}
function admin() {
  return '<section class="wrap">'+sectionHeading('LOCAL PREVIEW','Upload PSM circular','Import the circular PDF and review vacancies before replacing the feed in this browser.')+
    '<div class="panel form-panel admin-panel"><label class="button primary file-picker">'+icon('upload')+' Choose circular PDF<input type="file" data-upload="circular" accept="application/pdf,.pdf"></label>'+
    '<p class="subtle">The preview is local to this browser. Export a reviewed feed for repository publication.</p>'+
    (state.circularDraft?'<form id="publish-form"><h2>Review imported circular</h2>'+grid(input('draft','title','Circular title',null,state.circularDraft.title)+input('draft','advertised','Advertised date','date',state.circularDraft.advertised)+input('draft','closes','Closing date','date',state.circularDraft.closes))+
      input('draft','jobsText','Vacancies (JSON)','textarea',state.circularDraft.jobsText)+'<p>'+state.circularDraft.jobs.length+' vacancies detected. Review titles, ministries, duty stations and instructions against the PDF.</p><button class="button primary">Replace local feed</button></form>':'')+
    (state.circular!==seed&&state.circular.jobs.length?action('Export reviewed vacancies','export-feed','download'):'')+'</div></section>';
}
function render() {
  root.innerHTML=shell(({browse,profile,documents,admin})[state.view]());
  renderJobs();
}
function navigate() {
  if(location.hash==='#main') return;
  const target=location.hash.slice(1);
  state.view=target==='admin'&&state.admin?'admin':nav.some(([id])=>id===target)?target:'browse';
  render();
  window.scrollTo(0,0);
}
function go(target) {
  if(location.hash==='#'+target) navigate();
  else location.hash=target;
}
function download(blob, name) {
  const href=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=href; link.download=name; link.click();
  setTimeout(()=>URL.revokeObjectURL(href),60000);
}
function saveProfile() {
  return put('profile',state.profile);
}
async function prepare(jobId) {
  if (expired(state.circular)||state.pending) return;
  if (!confirmed()) {
    state.notice='Complete and confirm your profile before preparing forms.';
    go('profile');
    return;
  }
  const circular=state.circular;
  const job=circular.jobs.find(j=>j.id===jobId);
  if (!job) return;
  state.pending=jobId; state.jobStatus='Loading…'; renderJobs();
  try {
    const {prepareForms}=await import('./pdf.js');
    state.jobStatus='Filling forms…'; renderJobs();
    const bundle=await prepareForms(state.profile,job,circular);
    if (expired(circular)) throw new Error('This vacancy has closed.');
    const documents=[bundle,...state.documents.filter(item=>item.jobId!==jobId)];
    await put('documents',documents);
    state.documents=documents;
    status('Application and health forms completed.');
  } catch (error) { status(error.message); }
  finally { state.pending=null; renderJobs(); }
}
async function documentAction(name,bundle,index) {
  const file=bundle.files[index];
  if (name==='download') return download(file.blob,file.name);
  if (name==='open-doc') {
    const href=URL.createObjectURL(file.blob);
    window.open(href,'_blank','noopener');
    setTimeout(()=>URL.revokeObjectURL(href),300000);
    file.viewed=true;
  }
  if (name==='share') {
    const attachment=new File([file.blob],file.name,{type:'application/pdf'});
    if (navigator.canShare?.({files:[attachment]})) {
      try { await navigator.share({files:[attachment],title:file.label}); file.shared=true; }
      catch(error) { if(error.name!=='AbortError') status(error.message); return; }
    } else {
      const dialog=document.createElement('dialog');
      dialog.className='panel share-dialog';
      dialog.innerHTML='<h2>Share '+escape(file.label)+'</h2><p>Download the PDF first, then attach it in your email or WhatsApp message.</p><div class="dialog-actions"><a class="button secondary" href="mailto:?subject='+encodeURIComponent(file.label)+'">Email</a><a class="button secondary" href="https://wa.me/" target="_blank" rel="noopener">WhatsApp</a><button class="button primary" data-download>Download PDF</button><button class="button quiet" data-mark>Mark shared</button><form method="dialog"><button class="button quiet">Close</button></form></div>';
      dialog.querySelector('[data-download]').onclick=()=>download(file.blob,file.name);
      dialog.querySelector('[data-mark]').onclick=async()=>{file.shared=true; await put('documents',state.documents); dialog.close(); render();};
      dialog.addEventListener('close',()=>dialog.remove());
      document.body.append(dialog); dialog.showModal(); return;
    }
  }
  await put('documents',state.documents); render();
}
root.addEventListener('input',event=>{
  const el=event.target;
  if (el.dataset.filter) {state[el.dataset.filter]=el.value;renderJobs();return;}
  const {section,field}=el.dataset;
  if (!section) return;
  const [key,index]=section.split('.');
  const target=key==='draft'?state.circularDraft:key==='profile'?state.profile:index===undefined?state.profile[key]:state.profile[key][index];
  target[field]=el.value;
  if (key!=='draft') state.profile.confirmed=false;
});
root.addEventListener('change',event=>{
  const el=event.target;
  if(el.dataset.upload && el.files[0]) {
    const file=el.files[0];
    void upload(el.dataset.upload,file);
  }
  if (el.dataset.field && el.tagName==='SELECT' && (el.dataset.field==='employmentType'||[...fields.health,...fields.disclosures].some(([key])=>key===el.dataset.field))) render();
});
async function upload(kind,file) {
  status('Reading PDF…');
  try {
    const {importCircular,importProfile}=await import('./extract.js');
    if(kind==='circular') {
      state.circularDraft=await importCircular(file);
      state.circularDraft.jobsText=JSON.stringify(state.circularDraft.jobs,null,2);
      state.notice='Check the extracted vacancies against the circular.';
    } else {
      const imported=await importProfile(file);
      state.profile={...state.profile,...imported,confirmed:false};
      state.notice='Imported '+Object.keys(imported).length+' fields. Review and complete every section before confirming.';
    }
    render();
  } catch(error) { status(error.message); }
}
root.addEventListener('submit',async event=>{
  if(event.target.id!=='publish-form') return;
  event.preventDefault();
  try {
    const {title,advertised,closes,pdf,jobsText}=state.circularDraft;
    const jobs=JSON.parse(jobsText);
    if (!title?.trim()||!advertised||!closes||closes<advertised||!Array.isArray(jobs)||!jobs.length||jobs.some(j=>!j?.id||!j?.title||!j?.org||!j?.station)||new Set(jobs.map(j=>j.id)).size!==jobs.length) throw new Error('Enter a title, valid dates and unique, complete vacancies before replacing the feed.');
    const next={title,advertised,closes,pdf,jobs};
    await put('circular',next);
    state.circular=next;state.circularDraft=null;state.org='';state.station='';state.query='';state.selected='';
    retireCircular(); state.notice='The local vacancy feed was replaced.'; go('browse');
  } catch (error) {status(error.message);}
});
root.addEventListener('click',async event=>{
  const btn=event.target.closest('button[data-action]');
  if (!btn) return;
  const {action:name,id,kind,index}=btn.dataset;
  try {
    if(name==='details'){state.selected=state.selected===id?'':id;renderJobs();const replacement=[...root.querySelectorAll('[data-action="details"]')].find(el=>el.dataset.id===id);replacement?.focus();return;}
    if(name==='prepare') return await prepare(id);
    if(name==='view-bundle'){go('documents');setTimeout(()=>document.getElementById('bundle-'+id)?.scrollIntoView(),50);return;}
    if(name==='profile-section'){state.section=id;render();return;}
    if(name==='admin-mode'){state.admin=!state.admin;go(state.admin?'admin':'browse');return;}
    if(name==='add-row'){state.profile[kind].push({});state.profile.confirmed=false;render();return;}
    if(name==='remove-row'){state.profile[kind].splice(Number(index),1);state.profile.confirmed=false;render();return;}
    if(name==='save'){
      await saveProfile();
      const current=fields.sections.findIndex(([key])=>key===state.section);
      if(current<fields.sections.length-1) state.section=fields.sections[current+1][0];
      state.notice='Profile draft saved.';render();window.scrollTo(0,0);return;
    }
    if(name==='confirm'){
      const problems=fields.problems(state.profile);
      if(problems.length){status(problems[0]);return;}
      state.profile.confirmed=true;await saveProfile();state.notice='Profile confirmed. You can now prepare forms.';go('browse');return;
    }
    if(name==='clear'){
      if(!window.confirm('Clear the profile and all prepared documents from this browser?'))return;
      await Promise.all([remove('profile'),remove('documents')]);state.profile=fields.blankProfile();state.documents=[];state.section='personal';state.notice='Profile and documents cleared.';render();return;
    }
    if(name==='export-feed'){
      const {pdf,archived,...catalog}=state.circular;
      download(new Blob([JSON.stringify(catalog,null,2)],{type:'application/json'}),'circular.json');
      return;
    }
    const bundle=prepared(id);
    if(!bundle)return;
    if(name==='remove-pack'){
      if(!window.confirm('Remove this application pack from this browser?'))return;
      const documents=state.documents.filter(item=>item!==bundle);await put('documents',documents);state.documents=documents;render();return;
    }
    await documentAction(name,bundle,Number(index));
  } catch(error){status(error.message);}
});
window.addEventListener('hashchange',navigate);
let previouslyExpired=expired(state.circular);
setInterval(()=>{
  const wasArchived=state.circular.archived;
  retireCircular();
  const closed=expired(state.circular);
  if(closed!==previouslyExpired||wasArchived!==state.circular.archived){previouslyExpired=closed;if(state.view==='browse')render();}
},10000);
navigate();

}
initialize().catch(error => { document.querySelector('#app').textContent = 'Unable to open local storage. Enable browser storage and reload. ' + error.message; });
