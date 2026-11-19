import {supabase,user,isAdmin,decode,encode} from './backend.js';
import {annualSavings,monthlyYearCost,planList,PLANS,regularSubscriber} from './subscription-plans.js';
import {icon} from './icons.js';
import {pendingReturnInvoice,returnInvoiceKey} from './payment-config.js';
import {checkoutTown} from './paysme-towns.js';
import {paySMECode} from './paysme-code.js';
import {playStoreApp} from './mobile-app.js';

const date=value=>new Date(value).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'Africa/Windhoek'});
const allowancePlanNames={monthly:'Monthly',biannual:'Six-month',annual:'Annual'};
const sdkAvailable=sdk=>typeof sdk?.renderRequestToPayButton==='function'&&typeof sdk?.requestToPay==='function';
const statusError='Unable to load your allowance. Please try again or contact support@paysme.site.';

export async function subscriptionStatus(){
 const {data,error}=await supabase.rpc('subscription_status');
 if(error)throw Error(statusError);
 return data;
}

export async function savePreparedPack(bundle){
 const {data,error}=await supabase.rpc('save_prepared_pack',{p_bundle:await encode(bundle)});
 if(error)throw Error(error.message?.startsWith('FORM_ALLOWANCE:')?error.message:'Unable to save this preparation. Please try again or contact support@paysme.site.');
 return {documents:decode(data.documents),subscription:data.subscription};
}

export function subscriptionPage(){
 if(!regularSubscriber(user,isAdmin))return '';
 const cards=playStoreApp?'':planList.map(p=>{
  const {amount,percent}=annualSavings(p);
  return `<article class="panel price-card">
  <span class="eyebrow">${p.name}</span><h2>N$${p.monthly}<small> / month</small></h2>
  <p class="plan-total">${p.months===1?'N$50 billed monthly':'N$'+p.monthly+' × '+p.months+' months = <strong>N$'+p.total+'</strong>'}</p>
  <span class="saving-tag">${amount?'Save N$'+amount+' per year ('+percent+'%)':'Flexible monthly access'}</span>
  <p class="plan-quota">${p.quota?p.quota+' preparations per month':'Unlimited preparations'}</p>
  <div class="plan-request" data-plan="${p.id}"></div>
 </article>`;
 }).join('');
 return `<section class="wrap subscription-page">
  <div class="page-head"><span class="eyebrow">YOUR APPLICATION WORKSPACE</span><h1>Subscription</h1><p>${playStoreApp?'Check your access and remaining preparations.':'Choose a package and receive your payment link by SMS.'}</p></div>
  <div class="panel allowance-panel">
   <div class="allowance-heading">
    <div class="allowance-title">${icon('subscription',24)}<h2>Your Allowance</h2></div>
    <span class="allowance-pill" hidden></span>
   </div>
   <p id="subscription-status" role="status">Loading your allowance.</p>
   <p id="payment-return-status" role="status" hidden></p>
   <p id="payment-message" role="status" hidden></p>
   <button class="button quiet" id="refresh-subscription" type="button">
    <span class="auth-spinner" aria-hidden="true" hidden></span><span class="refresh-label">Refresh status</span>
   </button>
   <button class="button secondary" id="subscription-account-town" type="button" hidden>Set your town in My account</button>
  </div>
  ${cards?`<div class="subscription-grid">${cards}</div>`:''}
  ${cards?`<p class="subscription-explainer">Savings are compared with 12 monthly payments of N$${PLANS.monthly.total} (N$${monthlyYearCost} per year).</p>`:''}
  <p class="subscription-explainer">Everyone gets one free preparation, with or without a subscription. One preparation includes the employment form and health questionnaire for one vacancy. Regenerating or downloading the same vacancy pack is free. Removing documents does not restore an allowance.</p>
  <p class="subscription-explainer">Monthly allowances reset on your subscription anniversary. Unused preparations expire.${playStoreApp?'':' Six-month and annual packages are paid upfront. You can choose a new package when your current subscription ends or your pending invoice is cancelled or expires. Payment is confirmed before access activates.'}</p>
 </section>`;
}

let sdkPromise;
export function loadPaySME(win=window,doc=document){
 if(sdkAvailable(win.PaySME))return Promise.resolve(win.PaySME);
 if(sdkPromise)return sdkPromise;
 sdkPromise=new Promise((resolve,reject)=>{
  let script=doc.querySelector('script[data-seekgrn-paysme]');
  if(!script){
   script=doc.createElement('script');
   script.src='https://www.paysme.site/sdk/v1/paysme.js';
   script.defer=true;
   script.dataset.seekgrnPaysme='true';
   doc.head.append(script);
  }
  const finish=error=>{
   clearInterval(poll);
   clearTimeout(timeout);
   script.removeEventListener('error',failed);
   if(error){script.remove();reject(error);}
   else resolve(win.PaySME);
  };
  const failed=()=>finish(Error('PaySME is unavailable. Refresh status to try again.'));
  const poll=setInterval(()=>{if(sdkAvailable(win.PaySME))finish();},100);
  const timeout=setTimeout(failed,10000);
  script.addEventListener('error',failed,{once:true});
 });
 sdkPromise.catch(()=>{sdkPromise=undefined;});
 return sdkPromise;
}

function invoiceMessage(order,code){
 const reference=code?' for PaySME Code '+code:'';
 if(order.status==='paid'){
  if(order.review_required)return 'Payment received'+reference+'. Contact support@paysme.site to resolve this payment.';
  return 'Payment confirmed'+reference+'.';
 }
 if(order.status==='cancelled'||order.status==='expired')return 'Payment request'+reference+' '+order.status+'.';
 return 'Awaiting payment'+reference+'. Check your SMS for the PaySME payment link.';
}

function allowanceMessage(status,plan){
 const free=status.free_remaining||0;
 const balance=plan
  ? (status.unlimited?'Unlimited preparations':`${status.remaining||0} preparations left this month${free?` + ${free} free`:''}`)
  : (free?`${free} free preparation${free===1?'':'s'} available`:'Free preparation used');
 const summary=`${plan?allowancePlanNames[plan.id]+' plan · ':''}${balance}.`;
 const end=status.ends_at?date(status.ends_at):'';
 const upcoming=allowancePlanNames[status.upcoming_plan];
 const start=upcoming&&status.upcoming_at?date(status.upcoming_at):'';
 const reset=!status.unlimited&&status.renews_at?date(status.renews_at):'';
 const details=[summary];
 if(reset&&reset!==end&&reset!==start)details.push(`Monthly allowance resets ${reset}.`);
 if(end&&end!==start)details.push(`Package ends ${end}.`);
 if(start)details.push(end===start?`Switches to ${upcoming.toLowerCase()} on ${start}.`:`${upcoming} plan starts ${start}.`);
 return details.join(' ');
}

function allowancePill(status,plan,order){
 if(plan)return 'Active Subscription';
 if(status.upcoming_plan)return 'Subscription Scheduled';
 if(status.pending_invoices.length||order?.status==='pending')return 'Payment Pending';
 if(order?.status==='paid'&&order.review_required)return 'Payment Under Review';
 if(order?.status==='expired')return 'Payment Expired';
 if(order?.status==='cancelled')return 'Payment Cancelled';
 return 'Free Access';
}

export function mountSubscription(container,onStatus=()=>{},onTown=()=>{}){
 const applicantId=user?.id;
 const active=()=>container.isConnected&&user?.id===applicantId;
 const output=container.querySelector('#subscription-status');
 const allowance=container.querySelector('.allowance-panel');
 const statusPill=allowance.querySelector('.allowance-pill');
 const returnMessage=container.querySelector('#payment-return-status');
 const message=container.querySelector('#payment-message');
 const refreshButton=container.querySelector('#refresh-subscription');
 const refreshLabel=refreshButton.querySelector('.refresh-label');
 const refreshSpinner=refreshButton.querySelector('.auth-spinner');
 const townButton=container.querySelector('#subscription-account-town');
 const buttons=[];
 const codeKey=id=>'seekgrn-paysme-code:'+applicantId+':'+id;
 let invoice=pendingReturnInvoice(sessionStorage);
 let status=null,busy=false,refreshing=false,loadingButtons=false;
 const show=(node,value)=>{
  if(node.textContent!==value)node.textContent=value;
  node.hidden=!value;
 };
 const isLocked=()=>!status||status.plan!=='free'||status.upcoming_plan||status.pending_invoices.length>0;
 function syncButtons(){
  for(const button of buttons)button.disabled=busy||isLocked()||!checkoutTown(user);
  townButton.hidden=playStoreApp||Boolean(checkoutTown(user));
 }

 function setRefreshFeedback(checking){
  refreshButton.disabled=checking;
  refreshButton.setAttribute('aria-busy',String(checking));
  refreshLabel.textContent=checking?'Refreshing…':'Refresh status';
  refreshSpinner.hidden=!checking;
 }

 async function token(){
  const {data}=await supabase.auth.getSession();
  if(data.session?.user?.id!==applicantId)throw Error('Sign in again to continue.');
  return data.session.access_token;
 }

 async function checkInvoice(id,bearer){
  const response=await fetch('/api/subscription-status?invoice_id='+encodeURIComponent(id),
   {headers:{Authorization:'Bearer '+bearer},cache:'no-store'});
  const result=await response.json();
  if(!response.ok||result.order?.invoice_id!==id)throw Error(result.error||'Unable to check your payment.');
  return result.order;
 }

 async function refresh(){
  if(!active()||refreshing||busy)return;
  refreshing=true;
  try{
   let next=await subscriptionStatus();
   if(!active()||busy)return;
   if(!Array.isArray(next.pending_invoices))throw Error(statusError);
   const references=[...new Set([...next.pending_invoices,...(invoice?[invoice]:[])])];
   let order;
   if(!playStoreApp&&references.length){
    const bearer=await token();
    const results=await Promise.allSettled(references.map(id=>checkInvoice(id,bearer)));
    if(!active()||busy)return;
    const selected=results[0];
    if(selected.status==='fulfilled'){
     order=selected.value;
     const code=paySMECode(order.paysme_code)||paySMECode(sessionStorage.getItem(codeKey(order.invoice_id)));
     show(returnMessage,invoiceMessage(order,code));
    }
    else if(!next.pending_invoices.length)show(returnMessage,selected.reason.message);
    else show(returnMessage,'You have a pending PaySME payment request.');
    if(results.some(result=>result.status==='fulfilled'&&result.value.status!=='pending'&&next.pending_invoices.includes(result.value.invoice_id))){
     next=await subscriptionStatus();
    }
   }
   if(!active()||busy)return;
   status=next;
   onStatus(next);
   const plan=PLANS[next.plan];
   allowance.classList.toggle('is-active',Boolean(plan));
   show(statusPill,allowancePill(next,plan,order));
   show(output,allowanceMessage(next,plan));
  }catch(error){
   if(active()&&!busy){
    status=null;
    allowance.classList.remove('is-active');
    show(statusPill,'');
    show(output,error.message);
   }
  }finally{
   refreshing=false;
   if(active()){
    if(refreshButton.disabled)setRefreshFeedback(false);
    syncButtons();
   }
  }
 }

 async function sendRequest(plan,button,sdk){
  if(!active()||busy||isLocked()||!checkoutTown(user))return;
  busy=true;
  button.setAttribute('aria-busy','true');
  syncButtons();
  show(message,'Sending payment request…');
  try{
   const bearer=await token();
   if(!active())return;
   const response=await fetch('/api/subscription',{method:'POST',
    headers:{'Content-Type':'application/json',Authorization:'Bearer '+bearer},
    body:JSON.stringify({plan})});
   const result=await response.json();
   if(!response.ok)throw Error(result.error||'Unable to prepare your payment request.');
   if(active()){
    invoice=result.order.invoice_id;
    sessionStorage.setItem(returnInvoiceKey,invoice);
   }
   const request=await sdk.requestToPay({...result.checkout,show_notification:active()});
   const code=paySMECode(request?.generated_code??request?.paycode??request?.transaction?.generated_code);
   if(active()&&code)sessionStorage.setItem(codeKey(result.order.invoice_id),code);
   if(active())show(message,'');
  }catch(error){
   if(active())show(message,error.message||'Unable to send your payment request.');
  }finally{
   busy=false;
   status=null;
   button.removeAttribute('aria-busy');
   if(active()){syncButtons();void refresh();}
  }
 }

 async function mountButtons(){
  if(playStoreApp||loadingButtons||buttons.length)return;
  loadingButtons=true;
  try{
   const sdk=await loadPaySME();
   if(!active())return;
   for(const slot of container.querySelectorAll('.plan-request')){
    const button=sdk.renderRequestToPayButton({container:slot});
    // The SDK v1 button takes a fixed config. Reserve the invoice on this same click.
    button.addEventListener('click',event=>{
     event.stopImmediatePropagation();
     void sendRequest(slot.dataset.plan,button,sdk);
    },{capture:true});
    buttons.push(button);
   }
   syncButtons();
  }catch(error){
   if(active())show(message,error.message);
  }finally{loadingButtons=false;}
 }

 const focusRefresh=()=>{if(document.visibilityState==='visible')void refresh();};
 window.addEventListener('focus',focusRefresh);
 document.addEventListener('visibilitychange',focusRefresh);
 refreshButton.onclick=()=>{
  if(!active()||busy)return;
  setRefreshFeedback(true);
  show(message,'');
  void mountButtons();
  void refresh();
 };
 townButton.onclick=onTown;
 syncButtons();
 void mountButtons();
 void refresh();
 const timer=setInterval(()=>{
  if(document.visibilityState==='visible'&&(status?.pending_invoices.length||status?.ends_at||status?.upcoming_at))void refresh();
 },15000);
 return ()=>{
  clearInterval(timer);
  window.removeEventListener('focus',focusRefresh);
  document.removeEventListener('visibilitychange',focusRefresh);
 };
}
