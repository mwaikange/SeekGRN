import {supabase,user,isAdmin,decode,encode} from './backend.js';
import {planList,PLANS,regularSubscriber} from './subscription-plans.js';
import {icon} from './icons.js';
import {hostedPaymentUrl,pendingReturnInvoice,returnInvoiceKey} from './payment-config.js';
const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=v=>v?new Date(v).toLocaleDateString('en-GB',{timeZone:'Africa/Windhoek'}):'';
export async function subscriptionStatus(){
 const {data,error}=await supabase.rpc('subscription_status');
 if(error)throw Error('Unable to load your allowance. Please try again or contact support@paysme.site.');
 return data;
}
export async function savePreparedPack(bundle){
 const {data,error}=await supabase.rpc('save_prepared_pack',{p_bundle:await encode(bundle)});
 if(error)throw Error(error.message?.startsWith('FORM_ALLOWANCE:')?error.message:'Unable to save this preparation. Please try again or contact support@paysme.site.');
 return {documents:decode(data.documents),subscription:data.subscription};
}
export function subscriptionPage(){
 if(!regularSubscriber(user,isAdmin))return '';
 return '<section class="wrap subscription-page"><div class="page-head"><span class="eyebrow">YOUR APPLICATION WORKSPACE</span><h1>Subscription</h1><p>Choose the preparation allowance that fits your job search.</p></div><p id="payment-return-status" class="notice" role="status" hidden></p><div class="panel allowance-panel"><div>'+icon('subscription',24)+'<h2>Your allowance</h2></div><p id="subscription-status" role="status">Loading your allowance…</p><button class="button quiet" id="refresh-subscription" type="button">Refresh status</button></div><div class="subscription-grid">'+planList.map(p=>'<article class="panel price-card"><span class="eyebrow">'+p.name+'</span><h2>N$'+p.monthly+'<small> / month</small></h2><p class="plan-total">'+(p.months===1?'N$50 billed monthly':'N$'+p.monthly+' × '+p.months+' months = <strong>N$'+p.total+'</strong>')+'</p><span class="saving-tag">'+(p.saving?'Save N$'+p.saving+' ('+Math.round(p.saving/(50*p.months)*100)+'%)':'Flexible monthly access')+'</span><p class="plan-quota">'+(p.quota?p.quota+' preparations per month':'Unlimited preparations')+'</p><button type="button" class="button primary" data-plan="'+p.id+'">Pay via PaySME '+icon('arrow')+'</button></article>').join('')+'</div><p class="subscription-explainer">Everyone gets one free preparation, with or without a subscription. One preparation includes the employment form and health questionnaire for one vacancy. Regenerating or downloading the same vacancy pack is free. Removing documents does not restore an allowance.</p><p class="subscription-explainer">Monthly allowances reset on your subscription anniversary; unused preparations do not roll over. Six-month and annual packages are paid upfront. Renewals and package changes start after your current paid term. Payment is confirmed before access activates.</p><div id="subscription-checkout" class="panel subscription-checkout" hidden></div></section>';
}
let sdkPromise;
export function loadPaySME(win=window,doc=document){
 if(typeof win.PaySME?.renderRequestToPayButton==='function')return Promise.resolve(win.PaySME);
 if(sdkPromise)return sdkPromise;
 sdkPromise=new Promise((resolve,reject)=>{
  let script=doc.querySelector('script[data-seekgrn-paysme]');
  if(!script){script=doc.createElement('script');script.src='https://www.paysme.site/sdk/v1/paysme.js';script.defer=true;script.dataset.seekgrnPaysme='true';doc.head.append(script);}
  const finish=(error)=>{clearInterval(poll);clearTimeout(timeout);script.removeEventListener('error',failed);if(error)reject(error);else resolve(win.PaySME);};
  const failed=()=>finish(Error('SMS checkout is unavailable. Use secure checkout below or try again.'));
  const poll=setInterval(()=>{if(typeof win.PaySME?.renderRequestToPayButton==='function')finish();},100);
  const timeout=setTimeout(failed,10000);script.addEventListener('error',failed,{once:true});
 });
 sdkPromise.catch(()=>{sdkPromise=undefined;});
 return sdkPromise;
}
export const hostedCheckout=hostedPaymentUrl;
export function mountSubscription(container,onStatus=()=>{}){
 let alive=true,timer,busy=false;
 const applicantId=user?.id;
 const active=()=>alive&&container.isConnected&&user?.id===applicantId;
 let invoice=pendingReturnInvoice(sessionStorage);
 const returnMessage=container.querySelector('#payment-return-status');
 let checkingInvoice=false,invoicePolls=0;
 async function refreshInvoice(){
  if(!invoice||!active()||checkingInvoice)return;
  checkingInvoice=true;returnMessage.hidden=false;
  const requestedInvoice=invoice;
  try{
   const {data}=await supabase.auth.getSession();if(!active())return;
   const token=data.session?.access_token;if(!token)throw Error('Sign in with the account used for this payment.');
   const response=await fetch('/api/subscription-status?invoice_id='+encodeURIComponent(requestedInvoice),{headers:{Authorization:'Bearer '+token},cache:'no-store'});
   const result=await response.json();if(!active()||invoice!==requestedInvoice)return;
   if(!response.ok)throw Error(result.error||'Unable to check your payment.');
   if(result.order?.invoice_id!==requestedInvoice)throw Error('Unable to match this payment. Please refresh its status.');
   const paid=result.order.status==='paid';
   returnMessage.textContent=paid?'Payment confirmed for '+invoice+'. Your package details are shown below.':'Awaiting payment confirmation for '+invoice+'. You can refresh this page after completing payment.';
   if(paid)clearInterval(timer);
  }catch(error){if(active())returnMessage.textContent=error.message;}finally{checkingInvoice=false;if(active()&&invoice!==requestedInvoice)void refreshInvoice();}
 }
 const output=container.querySelector('#subscription-status');
 async function refresh(){
  if(!active())return;
  void refreshInvoice();
  try{
   const s=await subscriptionStatus();if(!active())return;onStatus(s);
   const p=PLANS[s.plan];
   output.textContent=(s.plan==='free'?'Free access':p?.name+' package')+' · '+(s.unlimited?'Unlimited preparations':(s.remaining||0)+' package preparations remaining this month')+' · '+s.free_remaining+' free preparation remaining.'+(s.renews_at?' Monthly period ends '+date(s.renews_at)+'.':'')+(s.ends_at?' Package ends '+date(s.ends_at)+'.':'')+(s.upcoming_plan?' Your '+PLANS[s.upcoming_plan]?.name+' package starts '+date(s.upcoming_at)+'.':'');
  }catch(error){if(active())output.textContent=error.message;}
 }
 const panel=container.querySelector('#subscription-checkout');
 const focusRefresh=()=>{if(document.visibilityState==='visible')void refresh();};
 window.addEventListener('focus',focusRefresh);document.addEventListener('visibilitychange',focusRefresh);
 container.querySelector('#refresh-subscription').onclick=()=>void refresh();
 for(const button of container.querySelectorAll('[data-plan]'))button.onclick=()=>{
  if(busy)return;
  const plan=PLANS[button.dataset.plan];
  panel.hidden=false;
  panel.innerHTML='<h2>'+plan.name+' · N$'+plan.total+'</h2><p>A secure payment link will be sent to your verified mobile. Complete payment from your SMS, then return here.</p><form id="subscription-town"><label class="field"><span>Your town</span><input name="town" autocomplete="address-level2" maxlength="100" required></label><button class="button secondary" type="submit">Continue with PaySME</button></form><p id="payment-message" role="status"></p><div id="paysme-request-button"></div><a id="paysme-fallback" class="button secondary" hidden target="_blank" rel="noopener">Open secure checkout</a>';
  panel.scrollIntoView({behavior:'smooth',block:'nearest'});
  panel.querySelector('input').focus({preventScroll:true});
  panel.querySelector('form').onsubmit=async event=>{
   event.preventDefault();if(busy)return;busy=true;
   const submit=event.currentTarget.querySelector('button'),message=panel.querySelector('#payment-message');
   submit.disabled=true;submit.textContent='Preparing payment…';
   try{
    const {data:session}=await supabase.auth.getSession();if(!active())return;
    const token=session.session?.access_token;if(!token)throw Error('Sign in again to continue.');
    const response=await fetch('/api/subscription',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({plan:plan.id,town:new FormData(event.target).get('town')})});
    const result=await response.json();if(!active())return;
    if(!response.ok)throw Error(result.error||'Unable to prepare payment.');
    invoice=result.order.invoice_id;invoicePolls=0;sessionStorage.setItem(returnInvoiceKey,invoice);void refreshInvoice();
    message.textContent='Loading PaySME…';
    const fallback=panel.querySelector('#paysme-fallback');fallback.href=hostedCheckout(result.checkout);
    let sdk;
    try{sdk=await loadPaySME();}catch(error){if(active()){fallback.hidden=false;throw error;}return;}
    if(!active())return;
    // Leave the official SDK button and notification unchanged. Callbacks refresh only.
    sdk.renderRequestToPayButton({...result.checkout,container:panel.querySelector('#paysme-request-button'),show_notification:true,
     on_request_sent:()=>{if(active()){message.textContent='Request to Pay Sent. Check your SMS.';void refresh();clearInterval(timer);timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh();},5000);}},
     on_already_paid:()=>{if(active()){message.textContent='Checking your payment confirmation…';void refresh();}},
     on_error:error=>{if(active())message.textContent=error?.message||'Unable to send your payment request. Please try again.';}
    });
    event.target.hidden=true;message.textContent='Tap the PaySME button to receive your payment link by SMS.';
   }catch(error){if(active()){message.textContent=error.message;submit.disabled=false;submit.textContent='Try again';}}
   finally{busy=false;}
  };
 };
 void refresh();
 if(invoice)timer=setInterval(()=>{if(++invoicePolls>24){clearInterval(timer);return;}if(document.visibilityState==='visible')void refresh();},5000);
 return ()=>{alive=false;clearInterval(timer);window.removeEventListener('focus',focusRefresh);document.removeEventListener('visibilitychange',focusRefresh);};
}
