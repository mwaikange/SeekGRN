import {supabase,user,isAdmin,decode,encode} from './backend.js';
import {planList,PLANS,regularSubscriber} from './subscription-plans.js';
import {icon} from './icons.js';
import {pendingReturnInvoice,returnInvoiceKey} from './payment-config.js';
import {checkoutTown} from './paysme-towns.js';

const date=value=>new Date(value).toLocaleDateString('en-GB',{timeZone:'Africa/Windhoek'});
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
 const cards=planList.map(p=>`<article class="panel price-card">
  <span class="eyebrow">${p.name}</span><h2>N$${p.monthly}<small> / month</small></h2>
  <p class="plan-total">${p.months===1?'N$50 billed monthly':'N$'+p.monthly+' × '+p.months+' months = <strong>N$'+p.total+'</strong>'}</p>
  <span class="saving-tag">${p.saving?'Save N$'+p.saving+' ('+Math.round(p.saving/(50*p.months)*100)+'%)':'Flexible monthly access'}</span>
  <p class="plan-quota">${p.quota?p.quota+' preparations per month':'Unlimited preparations'}</p>
  <div class="plan-request" data-plan="${p.id}"></div>
 </article>`).join('');
 return `<section class="wrap subscription-page">
  <div class="page-head"><span class="eyebrow">YOUR APPLICATION WORKSPACE</span><h1>Subscription</h1><p>Choose a package and receive your payment link by SMS.</p></div>
  <div class="panel allowance-panel">
   <div>${icon('subscription',24)}<h2>Your allowance</h2></div>
   <p id="subscription-status" role="status">Loading your allowance.</p>
   <p id="payment-return-status" role="status" hidden></p>
   <p id="payment-message" role="status" hidden></p>
   <button class="button quiet" id="refresh-subscription" type="button">Refresh status</button>
   <button class="button secondary" id="subscription-account-town" type="button" hidden>Set your town in My account</button>
  </div>
  <div class="subscription-grid">${cards}</div>
  <p class="subscription-explainer">Everyone gets one free preparation, with or without a subscription. One preparation includes the employment form and health questionnaire for one vacancy. Regenerating or downloading the same vacancy pack is free. Removing documents does not restore an allowance.</p>
  <p class="subscription-explainer">Monthly allowances reset on your subscription anniversary. Unused preparations expire. Six-month and annual packages are paid upfront. You can choose a new package when your current subscription ends or your pending invoice is cancelled or expires. Payment is confirmed before access activates.</p>
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

function invoiceMessage(order){
 if(order.status==='paid'){
  if(order.review_required)return 'Payment received for '+order.invoice_id+'. Contact support@paysme.site to resolve this payment.';
  return 'Payment confirmed for '+order.invoice_id+'. Your package details are shown above.';
 }
 if(order.status==='cancelled'||order.status==='expired')return 'Payment request '+order.invoice_id+' '+order.status+'.';
 return 'Awaiting payment for '+order.invoice_id+'. Check your SMS for the PaySME payment link.';
}

export function mountSubscription(container,onStatus=()=>{},onTown=()=>{}){
 const applicantId=user?.id;
 const active=()=>container.isConnected&&user?.id===applicantId;
 const output=container.querySelector('#subscription-status');
 const returnMessage=container.querySelector('#payment-return-status');
 const message=container.querySelector('#payment-message');
 const townButton=container.querySelector('#subscription-account-town');
 const buttons=[];
 let invoice=pendingReturnInvoice(sessionStorage);
 let status=null,busy=false,refreshing=false,loadingButtons=false;
 const show=(node,value)=>{
  if(node.textContent!==value)node.textContent=value;
  node.hidden=!value;
 };
 const isLocked=()=>!status||status.plan!=='free'||status.upcoming_plan||status.pending_invoices.length>0;
 function syncButtons(){
  for(const button of buttons)button.disabled=busy||isLocked()||!checkoutTown(user);
  townButton.hidden=Boolean(checkoutTown(user));
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
   if(references.length){
    const bearer=await token();
    const results=await Promise.allSettled(references.map(id=>checkInvoice(id,bearer)));
    if(!active()||busy)return;
    const selected=results[0];
    if(selected.status==='fulfilled')show(returnMessage,invoiceMessage(selected.value));
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
   show(output,(plan?plan.name+' package':'Free access')+' · '+(next.unlimited?'Unlimited preparations':(next.remaining||0)+' package preparations remaining this month')+' · '+next.free_remaining+' free preparation remaining.'+(next.renews_at?' Monthly period ends '+date(next.renews_at)+'.':'')+(next.ends_at?' Package ends '+date(next.ends_at)+'.':'')+(next.upcoming_plan?' Your '+PLANS[next.upcoming_plan]?.name+' package starts '+date(next.upcoming_at)+'.':''));
  }catch(error){
   if(active()&&!busy){status=null;show(output,error.message);}
  }finally{
   refreshing=false;
   if(active())syncButtons();
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
   await sdk.requestToPay({...result.checkout,show_notification:active()});
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
  if(loadingButtons||buttons.length)return;
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
 container.querySelector('#refresh-subscription').onclick=()=>{
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
