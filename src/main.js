import './style.css';
import { icon } from './icons.js';
import { displayDate, expired, retired } from './circular.js';
import * as fields from './profile.js';
import { get, put, remove } from './storage.js';
import {connect,supabase,user,isAdmin,refreshAccount} from './backend.js';
import {openAccount,registrationPending} from './auth.js';
import {legalPage} from './legal.js';
import {removalPage,submitRemoval} from './removal.js';
import {subscriptionPage,mountSubscription,subscriptionStatus,savePreparedPack} from './subscription.js';
import {preparationAvailable} from './subscription-plans.js';
import {capturePaymentReturn,returnInvoiceKey} from './payment-config.js';
import {exportMobileFile,inMobileApp,mobileReady,mobileUnavailable,pickMobileCircular,playStoreApp} from './mobile-app.js';

function circularPicker() {
  const label=icon('upload')+' Choose circular PDF';
  return inMobileApp
    ? '<button type="button" class="button primary" data-mobile-upload="circular">'+label+'</button>'
    : '<label class="button primary file-picker">'+label+'<input type="file" data-upload="circular" accept="application/pdf,.pdf"></label>';
}

async function initialize() {
capturePaymentReturn(location,sessionStorage);
let recovering = false;
const authSubscription = supabase.auth.onAuthStateChange(event => {
  if (event === 'PASSWORD_RECOVERY') recovering = true;
});
await connect();
authSubscription.data.subscription.unsubscribe();
const root = document.querySelector('#app');
const blank = fields.blankProfile();
const nav = [['browse','grid','Browse'],['profile','user','Profile'],['documents','file','My Documents']];
const state = {
  view: 'browse', section: 'personal', profile: {...blank,...await get('profile')},
  documents: await get('documents') ?? [], circular: await get('circular'),
  admin: isAdmin, query: '', org: '', station: '', selected: '', notice: '', jobStatus: '', pending: null
};
let cachedPdf, cachedPdfUrl, closeViewer, closeSubscription;
const intentKey='seekgrn-action';
function requireAccount(intent) {
  if(user&&!registrationPending()) return true;
  sessionStorage.setItem(intentKey,JSON.stringify(intent));
  openAccount(reloadAccount,user?'contacts':'login',resumeAction);
  return false;
}
async function resumeAction() {
  let intent;try{intent=JSON.parse(sessionStorage.getItem(intentKey));}catch{}
  sessionStorage.removeItem(intentKey);
  if(!intent)return;
  if(intent.type==='prepare')await prepare(intent.id);
  else if(['profile','documents','circular','subscription'].includes(intent.view))go(intent.view);
}
function circularLink(circular) {
  if (cachedPdf !== circular.pdf) {
    if (cachedPdfUrl) URL.revokeObjectURL(cachedPdfUrl);
    cachedPdf = circular.pdf;
    cachedPdfUrl = cachedPdf instanceof Blob ? URL.createObjectURL(cachedPdf) : '';
  }
  return cachedPdfUrl || (typeof cachedPdf === 'string' ? cachedPdf : '');
}
const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const action = (label, name, symbol, classes='button secondary', props='') =>
  '<button type="button" class="'+classes+'" data-action="'+name+'" '+props+'>'+(symbol?icon(symbol):'')+escape(label)+'</button>';
const navLink = ([id,symbol,label]) => '<a href="#'+id+'" class="nav-link '+(state.view===id?'active':'')+'" '+(state.view===id?'aria-current="page"':'')+'>'+icon(symbol)+'<span>'+escape(label)+'</span></a>';
const prepared = id => state.documents.find(bundle=>bundle.jobId===id);
const confirmed = () => state.profile.confirmed && !fields.problems(state.profile).length;
const status = message => {state.notice=message; const el=root.querySelector('#notice'); if(el){el.textContent=message;el.hidden=!message;}};
function retireCircular() {
  if (!retired(state.circular) || state.circular.archived) return;
  state.circular = {...state.circular,jobs:[],pdf:null,archived:true};

}
retireCircular();

function shell(content) {
  return '<a class="skip" href="#main">Skip to content</a><header class="mast '+(state.view==='browse'?'home-mast':'')+'"><div class="wrap mast-inner">'+
    '<a class="brand" href="#browse"><span class="brand-icon">'+icon('briefcase',23)+'</span><span>Seek<span class="brand-grn">GRN</span>Jobs<small>NAMIBIA PUBLIC SERVICE VACANCIES</small></span></a>'+
    (user&&!registrationPending()?'<nav class="app-nav" aria-label="Main navigation">'+nav.map(navLink).join('')+(state.admin?navLink(['admin','shield','Admin']):navLink(['subscription','subscription','Subscription']))+'</nav>':'')+
    action(user?'My account':'Sign in','account','user','button quiet mast-action')+'</div></header>'+
    '<main id="main">'+content+'<p id="notice" role="status" class="notice wrap" '+(state.notice?'':'hidden')+'>'+escape(state.notice)+'</p></main>'+
    '<footer class="wrap footer"><div><a class="footer-brand" href="#browse">SeekGRNJobs</a><p>Independent application preparation tool for Namibia’s Public Service.</p><div class="footer-details"><nav class="footer-legal" aria-label="Legal"><a href="#terms">Terms of Service</a><span aria-hidden="true">|</span><a href="#privacy">Privacy Policy</a><span aria-hidden="true">|</span><a href="/request-account-removal">Account Removal</a></nav><p><a href="mailto:support@paysme.site">support@paysme.site</a> · <a href="tel:+264836795150">+264 83 679 5150</a></p><p class="footer-owner">Owned &amp; Managed by Mwai PaySME Solutions cc</p></div></div></footer>';
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
  const link = circularLink(c);
  return '<div class="wrap"><section class="hero"><div class="hero-art" aria-hidden="true"><i></i><i></i><i></i></div><div class="hero-main"><span class="eyebrow"><span class="signal"></span> NAMIBIA PUBLIC SERVICE</span>'+
    '<h1>Find your next<br><em>public service role.</em></h1><p>Explore vacancies from the PSM circular and prepare the official application forms using your saved profile.</p></div>'+
    '<div class="issue"><span class="issue-icon">'+icon('file',24)+'</span><span class="eyebrow">CURRENT CIRCULAR</span><strong>'+escape(c.title)+'</strong>'+
    '<span class="issue-date">'+icon('clock',16)+(c.archived?'Awaiting publication':(expired(c)?'Closed ':'Closes ')+displayDate(c.closes))+'</span>'+
    (link?'<a href="#circular" data-circular-page="1">Read circular '+icon('file',15)+'</a>':'')+'</div></section>'+
    '<div class="workbench"><section class="vacancies"><div class="area-title"><h2>Browse vacancies</h2><span class="count" id="count"></span></div>'+
    '<div class="filters"><label class="search">'+icon('search')+'<input aria-label="Search vacancies" placeholder="Search by job title or ministry" value="'+escape(state.query)+'" data-filter="query"></label>'+filterOptions('org','All ministries')+filterOptions('station','All duty stations')+'</div>'+
    '<div id="jobs" class="job-list"></div></section><aside class="guide"><div class="guide-icon">'+icon('user',23)+'</div><h2>Your applicant profile</h2><p>Enter your details once and reuse them for each set of government application forms.</p>'+
    '<a class="button primary" href="#profile">'+(confirmed()?'View profile':'Set up my profile')+icon('arrow',16)+'</a>'+(user?'<a class="button quiet" href="#documents">'+icon('file')+'My documents</a>':'')+'<hr>'+
    '<div class="guide-note">'+icon('shield',19)+'<p>Your profile and documents are saved privately to your account. Submit your signed forms and supporting documents via the Human Resources office listed in the circular.</p></div></aside></div></div>';
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
    const record=expanded?['requirements','duties','contact','delivery','details'].filter(k=>j[k]).map(k=>'<div><h3>'+({requirements:'Requirements',duties:'Responsibilities',contact:'Enquiries',delivery:'Where to submit',details:'Circular listing'})[k]+'</h3><p>'+escape(j[k])+'</p></div>').join(''):'';
    return '<article class="job"><div class="job-main"><span class="job-icon">'+icon('building',23)+'</span><div class="job-copy"><div class="job-tags"><span class="tag">'+escape(j.grade?'Grade '+j.grade:'Public service')+'</span>'+ (j.reference?'<span class="tag muted">'+escape(j.reference)+'</span>':'')+'</div>'+
      '<h3><button type="button" class="title-link" aria-expanded="'+expanded+'" data-action="details" data-id="'+escape(j.id)+'">'+escape(j.title)+'</button></h3><p class="job-org">'+escape(j.org)+'</p>'+
      '<p class="job-meta">'+(j.station?'<span>'+icon('pin',15)+escape(j.station)+'</span>':'')+'<span>'+icon('clock',15)+(expired(c)?'Closed ':'Closes ')+displayDate(c.closes)+'</span></p></div>'+
      '<div class="job-action">'+(done?action('View forms','view-bundle','file','button secondary','data-id="'+escape(j.id)+'"'):action(state.pending===j.id?state.jobStatus:expired(c)?'Closed':'Prepare forms','prepare','arrow','button secondary','data-id="'+escape(j.id)+'" '+(expired(c)||state.pending?'disabled':'')))+'</div></div>'+
      (expanded?'<div class="job-detail"><div class="job-extra"><span>'+escape(j.unit)+'</span><strong>'+escape(j.salary)+'</strong></div>'+record+(j.page&&circularLink(c)?'<p class="source"><a href="#circular" data-circular-page="'+Number(j.page)+'">Check the official circular from page '+escape(j.page)+'</a></p>':'')+'</div>':'')+'</article>';
  }).join(''):'<div class="empty">'+icon('search',28)+'<h3>'+ (c.archived?'No current circular':'No matching vacancies')+'</h3><p>'+(c.archived?'New vacancies will appear when the next circular is published.':'Try a different search or clear the ministry and duty station filters.')+'</p></div>';
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
    case 'qualifications': return '<h3>Highest school qualification</h3>'+fieldGrid(fields.qualifications,p.school,'school')+'<h3>Universities, colleges and other institutions</h3>'+repeaters('tertiary',fields.qualifications,'Qualification',3)+
      '<h3>Further study and registration</h3>'+fieldGrid(fields.otherQualifications)+'<h3>Language proficiency</h3>'+repeaters('languages',fields.languages,'Language',6,true);
    case 'experience': return '<p class="subtle">Enter the most relevant roles. The template provides four labelled rows and space for a fifth entry.</p>'+repeaters('experience',fields.experience,'Role',5);
    case 'health': return '<p class="subtle">Answer each question. For a Yes answer, describe the condition, severity, date and duration as applicable.</p>'+fieldGrid([['height','Height (cm)','number'],['mass','Body mass (kg)','number']])+fields.health.map(question).join('');
    case 'review': {
      const warnings=fields.problems(p);
      return fields.disclosures.map(question).join('')+'<div class="confirm-box"><h3>Confirm your profile</h3><p>Review the details you entered. Sign the printed application and health declaration before submitting them.</p>'+
        (warnings.length?'<ul>'+warnings.map(w=>'<li>'+escape(w)+'</li>').join('')+'</ul>':'')+
        action(p.confirmed?'Profile confirmed':'Confirm profile','confirm','check','button primary',p.confirmed?'disabled':'')+'</div>';
    }
    default: return fieldGrid(fields.personal);
  }
}
function profile() {
  if(!user||registrationPending())return signInPrompt();
  return '<section class="wrap">'+sectionHeading('APPLICANT PROFILE','My profile','Enter and confirm your details once. We reuse them to fill in future application forms.')+
    '<div class="page-grid"><aside class="panel side-steps"><div class="profile-state">'+icon(confirmed()?'check':'user')+(confirmed()?'Confirmed profile':'Profile draft')+'</div>'+
    fields.sections.map(([id,label])=>action(label,'profile-section',null,state.section===id?'step active':'step','data-id="'+id+'"')).join('')+
    action('Clear profile and documents','clear','close','button quiet clear')+'</aside><div class="panel form-panel"><h2>'+fields.sections.find(([id])=>id===state.section)[1]+'</h2>'+profileContent()+
    '<div class="form-footer"><span>'+icon('shield',16)+' Saved to your account</span>'+action('Save and continue','save','arrow','button primary')+'</div></div></div></section>';
}
function documents() {
  if(!user||registrationPending())return signInPrompt();
  return '<section class="wrap">'+sectionHeading('APPLICATION PACKS','My documents','View, download or share the forms you prepared for each vacancy.')+
    (state.documents.length?'<div class="document-list">'+state.documents.map(bundle=>'<article class="panel document" id="bundle-'+escape(bundle.jobId)+'"><div class="area-title"><h2>'+escape(bundle.title)+'</h2><span class="tag">'+displayDate(bundle.date)+'</span></div><p>'+escape(bundle.org)+'</p>'+
      bundle.files.map((file,i)=>'<div class="document-row"><span class="job-icon">'+icon('file')+'</span><div class="doc-label"><strong>'+escape(file.label)+'</strong><p>'+escape([file.viewed?'Viewed':'Ready',file.shared?'Shared':''].filter(Boolean).join(' · '))+'</p></div>'+
      action('View','open-doc','external','button quiet','data-id="'+escape(bundle.jobId)+'" data-index="'+i+'"')+
      action('Download','download','download','button secondary','data-id="'+escape(bundle.jobId)+'" data-index="'+i+'"')+
      action('Share','share','share','button secondary','data-id="'+escape(bundle.jobId)+'" data-index="'+i+'"')+'</div>').join('')+
      '<p class="subtle">Review and sign the forms. Include the additional information sheet if one was generated, plus your CV and certified supporting documents. Follow the circular’s delivery instructions.</p>'+
      action('Remove pack','remove-pack','close','button quiet','data-id="'+escape(bundle.jobId)+'"')+'</article>').join('')+'</div>':'<div class="empty panel">'+icon('file',32)+'<h2>No application packs yet</h2><p>Choose a vacancy and select Prepare forms to complete the official PDFs.</p><a class="button primary" href="#browse">Browse vacancies '+icon('arrow',16)+'</a></div>')+'</section>';
}
function admin() {
  if(!isAdmin)return signInPrompt();
  return '<section class="wrap">'+sectionHeading('ADMINISTRATION','Upload PSM circular','Import and review the monthly circular before publishing it for all applicants.')+
    '<div class="panel form-panel admin-panel">'+circularPicker()+
    '<p class="subtle">Publishing replaces the current circular for everyone. Vacancies close at 00:00 Namibia time on the closing date and are removed two days later.</p>'+
    (state.circularDraft?'<form id="publish-form"><h2>Review imported circular</h2>'+grid(input('draft','title','Circular title',null,state.circularDraft.title)+input('draft','advertised','Advertised date','date',state.circularDraft.advertised)+input('draft','closes','Closing date','date',state.circularDraft.closes))+
      input('draft','jobsText','Vacancies (JSON)','textarea',state.circularDraft.jobsText)+'<p>'+state.circularDraft.jobs.length+' vacancies detected. Review titles, ministries, duty stations and instructions against the PDF.</p><button class="button primary">Publish circular</button></form>':'')+
    (state.circular.jobs.length?action('Export reviewed vacancies','export-feed','download'):'')+'</div></section>';
}
async function reloadAccount() {
 if(!user){
  sessionStorage.removeItem(intentKey);
  sessionStorage.removeItem('seekgrn-registration');
  sessionStorage.removeItem(returnInvoiceKey);
  document.querySelector('.auth-sheet')?.close();
  state.view='browse';state.profile=fields.blankProfile();state.documents=[];
  state.admin=false;state.notice='';state.circularDraft=undefined;state.pending=null;state.subscription=null;
  history.replaceState(null,'','/#browse');render();window.scrollTo(0,0);return;
 }
 state.profile={...fields.blankProfile(),...await get('profile')};
 state.documents=await get('documents')??[];
 state.admin=isAdmin;state.notice='';
 if((state.view==='admin'&&!isAdmin)||(state.view==='subscription'&&isAdmin))state.view='browse';
 state.subscription=null;
 render();
}
function signInPrompt() {return '<section class="wrap"><div class="empty panel"><h1>Your application workspace</h1><p>Sign in to save your profile and access your forms across devices.</p>'+action('Sign in or register','account','user','button primary')+'</div></section>';}
function circular() {
  if(!user||registrationPending())return signInPrompt();
  return '<section class="wrap">'+sectionHeading('OFFICIAL CIRCULAR',state.circular.title,'Read the circular here, then return to vacancies to prepare your forms.')+'<a class="button secondary" href="#browse">Back to vacancies</a><div id="circular-viewer" class="pdf-reader" aria-label="Official circular"><p role="status">Loading circular…</p></div></section>';
}
function render() {
  closeViewer?.();closeViewer=undefined;closeSubscription?.();closeSubscription=undefined;
  document.body.classList.toggle('home-screen',state.view==='browse');
  document.body.classList.toggle('has-app-nav',Boolean(user&&!registrationPending()));
  root.innerHTML=shell(({browse,profile,documents,admin,circular,subscription:subscriptionPage,terms:()=>legalPage('terms'),privacy:()=>legalPage('privacy'),removal:()=>removalPage(user)})[state.view]());
  root.querySelector('#removal-form')?.addEventListener('submit',submitRemoval);
  if(state.view==='subscription'&&user&&!isAdmin)closeSubscription=mountSubscription(
    root.querySelector('.subscription-page'),
    s=>{state.subscription=s;},
    ()=>openAccount(reloadAccount,'town')
  );
  renderJobs();
  if(state.view==='circular'&&user&&!registrationPending()) {
    const container=root.querySelector('#circular-viewer');
    import('./circular-viewer.js').then(async({mountCircular})=>{
      if(!container?.isConnected)return;
      closeViewer=await mountCircular(container,circularLink(state.circular),state.circularPage||1);
    }).catch(error=>status(error.message));
  }
}
function navigate() {
  if(location.hash==='#main') return;
  const target=location.hash.slice(1)||(location.pathname==='/request-account-removal'?'removal':'browse');
  if(['profile','documents','circular','subscription'].includes(target)&&!requireAccount({view:target})) {
    history.replaceState(null,'',location.pathname+location.search+'#browse');state.view='browse';render();return;
  }
  state.view=target==='subscription'&&state.admin?'browse':target==='subscription'?'subscription':target==='admin'&&state.admin?'admin':[...nav.map(([id])=>id),'circular','terms','privacy','removal'].includes(target)?target:'browse';
  render();
  window.scrollTo(0,0);
}
function go(target) {
  if(location.hash==='#'+target) navigate();
  else location.hash=target;
}
async function download(blob, name) {
  if(inMobileApp){
    try {if(await exportMobileFile('save',blob,name))status('Saved '+name+'.');}
    catch(error){status(error.message);}
    return;
  }
  const href=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=href; link.download=name; link.click();
  setTimeout(()=>URL.revokeObjectURL(href),60000);
}
function saveProfile() {
  return put('profile',state.profile);
}
async function prepare(jobId) {
  if(!requireAccount({type:'prepare',id:jobId}))return;
  if (expired(state.circular)||state.pending) return;
  if (!confirmed()) {
    state.notice='Complete and confirm your profile before preparing forms.';
    go('profile');
    return;
  }
  const circular=state.circular;
  const applicantId=user.id;
  const profile=structuredClone(state.profile);
  const job=circular.jobs.find(j=>j.id===jobId);
  if (!job) return;
  state.pending=jobId; state.jobStatus='Loading…'; renderJobs();
  try {
    if(!state.admin&&!prepared(jobId)){
      state.subscription=await subscriptionStatus();
      if(user?.id!==applicantId)return;
      if(!preparationAvailable(state.subscription)){state.notice=playStoreApp?'Your preparation allowance is used.':'Your preparation allowance is used. Choose a subscription to prepare more forms.';go('subscription');return;}
    }
    const {prepareForms}=await import('./pdf.js');
    state.jobStatus='Filling forms…'; renderJobs();
    const bundle=await prepareForms(profile,job,circular);
    if(user?.id!==applicantId) return;
    if (expired(circular)) throw new Error('This vacancy has closed.');
    const saved=await savePreparedPack(bundle);
    const documents=saved.documents;state.subscription=saved.subscription;
    if(user?.id!==applicantId) return;
    state.documents=documents;
    status('Application and health forms completed.');
  } catch (error) { status(error.message); }
  finally { state.pending=null; renderJobs(); }
}
async function documentAction(name,bundle,index) {
  const file=bundle.files[index];
  if (!file || !user) return;
  const applicantId=user.id;
  if (name==='download') return download(file.blob,file.name);
  if (name==='open-doc') {
    const href=URL.createObjectURL(file.blob);
    if(inMobileApp){
      file.viewed=true;
      await put('documents',state.documents);
      if(user?.id!==applicantId){URL.revokeObjectURL(href);return;}
      render();
      const dialog=document.createElement('dialog');
      dialog.className='panel document-preview';
      dialog.innerHTML='<h2>'+escape(file.label)+'</h2><form method="dialog"><button class="button secondary">Close</button></form><div class="pdf-reader"></div>';
      document.body.append(dialog);dialog.showModal();
      let dispose;
      dialog.addEventListener('close',()=>{dispose?.();URL.revokeObjectURL(href);dialog.remove();},{once:true});
      const viewer=dialog.querySelector('.pdf-reader');
      try {
        const {mountCircular}=await import('./circular-viewer.js');
        if(viewer.isConnected){
          dispose=await mountCircular(viewer,href,1,file.label);
          if(!viewer.isConnected)dispose();
        }
      }catch(error){viewer.textContent=error.message;}
      return;
    }
    window.open(href,'_blank','noopener');
    setTimeout(()=>URL.revokeObjectURL(href),300000);
    file.viewed=true;
  }
  if (name==='share') {
    if(inMobileApp){
      try {if(!await exportMobileFile('share',file.blob,file.name))return;}
      catch(error){status(error.message);return;}
      if(user?.id===applicantId&&!file.shared&&window.confirm('Mark this document as shared?')){
        file.shared=true;
        await put('documents',state.documents);render();
      }
      return;
    }
    const attachment=new File([file.blob],file.name,{type:'application/pdf'});
    if (navigator.canShare?.({files:[attachment]})) {
      try { await navigator.share({files:[attachment],title:file.label}); file.shared=true; }
      catch(error) { if(error.name!=='AbortError') status(error.message); return; }
    } else {
      const dialog=document.createElement('dialog');
      dialog.className='panel share-dialog';
      dialog.innerHTML='<h2>Share '+escape(file.label)+'</h2><p>Download the PDF first, then attach it in your email or WhatsApp message.</p><div class="dialog-actions"><a class="button secondary" href="mailto:?subject='+encodeURIComponent(file.label)+'">Email</a><a class="button secondary" href="https://wa.me/" target="_blank" rel="noopener">WhatsApp</a><button class="button primary" data-download>Download PDF</button><button class="button quiet" data-mark>Mark shared</button><form method="dialog"><button class="button quiet">Close</button></form></div>';
      dialog.querySelector('[data-download]').onclick=()=>download(file.blob,file.name);
      dialog.querySelector('[data-mark]').onclick=async()=>{if(user?.id!==applicantId){dialog.close();return;}file.shared=true; await put('documents',state.documents); dialog.close(); render();};
      dialog.addEventListener('close',()=>dialog.remove());
      document.body.append(dialog); dialog.showModal(); return;
    }
  }
  if(user?.id===applicantId){await put('documents',state.documents); render();}
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
  if(el.dataset.upload==='circular'&&el.files?.[0])void uploadCircular(el.files[0]);
  if (el.dataset.field && el.tagName==='SELECT' && (el.dataset.field==='employmentType'||[...fields.health,...fields.disclosures].some(([key])=>key===el.dataset.field))) render();
});
async function uploadCircular(file) {
  if(!isAdmin){status('Super-admin access is required.');return;}
  status('Reading PDF.');
  try {
    const {importCircular}=await import('./extract.js');
    state.circularDraft=await importCircular(file);
    state.circularDraft.jobsText=JSON.stringify(state.circularDraft.jobs,null,2);
    state.notice='Check the extracted vacancies against the circular.';
    render();
  } catch(error) { status(error.message); }
}
root.addEventListener('submit',async event=>{
  if(event.target.id!=='publish-form') return;
  event.preventDefault();
  if(!isAdmin){status('Super-admin access is required.');return;}
  const publishButton=event.target.querySelector('button[type="submit"],button');
  if(publishButton.disabled)return;
  publishButton.disabled=true;
  try {
    const {title,advertised,closes,pdf,jobsText}=state.circularDraft;
    const jobs=JSON.parse(jobsText);
    if (!title?.trim()||!advertised||!closes||closes<advertised||!Array.isArray(jobs)||!jobs.length||jobs.some(j=>!j?.id||!j?.title||!j?.org||!j?.station)||new Set(jobs.map(j=>j.id)).size!==jobs.length) throw new Error('Enter a title, valid dates and unique, complete vacancies before replacing the feed.');
    const next={title,advertised,closes,pdf,jobs};
    if(expired(next)) throw new Error('Enter a closing date in the future.');
    await put('circular',next);
    state.circular=next;state.circularDraft=null;state.org='';state.station='';state.query='';state.selected='';
    retireCircular(); state.notice='The circular was published.'; go('browse');
  } catch (error) {status(error.message);}
  finally {publishButton.disabled=false;}
});
root.addEventListener('click',async event=>{
  const mobilePicker=event.target.closest('[data-mobile-upload="circular"]');
  if(mobilePicker){
    if(!isAdmin){status('Super-admin access is required.');return;}
    const applicantId=user?.id;
    try {
      const file=await pickMobileCircular();
      if(file&&user?.id===applicantId&&mobilePicker.isConnected)await uploadCircular(file);
    }catch(error){status(error.message);}
    return;
  }
  const circularSource=event.target.closest('a[data-circular-page]');
  if(circularSource){event.preventDefault();state.circularPage=Number(circularSource.dataset.circularPage)||1;go('circular');return;}
  const btn=event.target.closest('button[data-action]');
  if (!btn) return;
  const {action:name,id,kind,index}=btn.dataset;
  try {
    if(name==='details'){state.selected=state.selected===id?'':id;renderJobs();const replacement=[...root.querySelectorAll('[data-action="details"]')].find(el=>el.dataset.id===id);replacement?.focus();return;}
    if(name==='prepare') return await prepare(id);
    if(name==='view-bundle'){go('documents');setTimeout(()=>document.getElementById('bundle-'+id)?.scrollIntoView(),50);return;}
    if(name==='profile-section'){state.section=id;render();return;}
    if(name==='account'){openAccount(reloadAccount,user&&registrationPending()?'contacts':'login',resumeAction);return;}
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
      if(!window.confirm('Clear the profile and all prepared documents from your account?'))return;
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
      if(!window.confirm('Remove this application pack from your account?'))return;
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
if(recovering) openAccount(reloadAccount,'password');
else if(registrationPending())openAccount(reloadAccount,'contacts',resumeAction);
else if(user)void resumeAction();
mobileReady();
supabase.auth.onAuthStateChange(event=>{
  if(event==='SIGNED_OUT') setTimeout(async ()=>{
    try {
      await refreshAccount();
      if(!user) await reloadAccount();
    } catch(error) { status(error.message); }
  },0);
});

}
initialize().catch(error => {
  document.querySelector('#app').textContent = 'Unable to connect. Check your internet connection and reload. ' + error.message;
  mobileUnavailable();
});
