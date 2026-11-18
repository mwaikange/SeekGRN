import {supabase,user,isAdmin,providers,refreshAccount} from './backend.js';
import {icon} from './icons.js';
import {namibianPhone,registerAccount,sendPhoneCode,verifyContact,verifiedContacts} from './auth-service.js';

const safe = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pendingKey = 'seekgrn-registration';
function pendingRegistration() {try {return JSON.parse(sessionStorage.getItem(pendingKey)) || {};} catch {return {};}}
export function registrationPending() {return Boolean(user && !isAdmin && (!verifiedContacts(user) || pendingRegistration().oauth));}

export function openAccount(onChange, initial='login', onSuccess=()=>{}) {
 if(document.querySelector('.auth-sheet')) return;
 const pending = pendingRegistration();
 let mode = initial==='password'?'password':user?(initial==='contacts'?'contacts':'account'):initial;
 let method='email', email=user?.email || pending.email || '', phone=user?.phone || pending.phone || user?.user_metadata?.contact_phone || '';
 let challenge, afterVerify, expectedUserId, busy=false, resendAt=0;
 const dialog=document.createElement('dialog'); dialog.className='auth-sheet';
 dialog.setAttribute('aria-labelledby','auth-title'); document.body.append(dialog); document.body.classList.add('sheet-open');
 const message = text => {const node=dialog.querySelector('#auth-message'); if(node)node.textContent=text;};
 const remember = extra => sessionStorage.setItem(pendingKey,JSON.stringify({email,phone,...extra}));
 const phoneField = () => '<label class="field"><span>Mobile number</span><span class="phone-input"><span class="phone-prefix">+264</span><input name="phone" aria-label="Mobile number" type="tel" inputmode="numeric" autocomplete="tel-national" placeholder="81 808 3704" value="'+safe(phone.replace(/^\+?264/,''))+'" required></span></label>';
 const emailField = (readonly=false) => '<label class="field"><span>Email address</span><input name="email" type="email" autocomplete="email" value="'+safe(email)+'" '+(readonly?'readonly':'')+' required></label>';
 const passwordField = () => '<label class="field"><span>Password</span><input name="password" type="password" autocomplete="'+(mode==='login'?'current-password':'new-password')+'" minlength="8" required></label>';
 function draw(info='') {
  const signup=mode==='signup',login=mode==='login',verify=mode==='verify',contacts=mode==='contacts';
  const titles={login:'Welcome back.',signup:'Your next chapter starts here.',forgot:'Reset your password.',verify:'Check your '+(challenge?.phone?'mobile.':'email.'),password:'Choose a new password.',contacts:'Complete your account.',account:'Your account.'};
  let content='';
  if(mode==='account') content='<div class="account-details"><p>'+safe(user?.email || 'Email not added')+'</p><p>'+safe(user?.phone || 'Mobile number not verified')+'</p><span class="tag">'+(verifiedContacts(user)?'Both contacts verified':'Contact verification pending')+'</span></div><button class="button primary" data-mode="contacts">'+icon('shield')+' Verify contact details</button><button class="button secondary" id="signout">Sign out</button>';
  else {
   if(login||signup) content+='<div class="auth-tabs" role="group" aria-label="Sign-in method"><button type="button" data-method="email" aria-pressed="'+(method==='email')+'">'+icon('mail')+'Email</button><button type="button" data-method="mobile" aria-pressed="'+(method==='mobile')+'">'+icon('phone')+'Mobile</button></div>';
   content+='<form id="auth-form">';
   if(verify) content+='<p>Enter the code sent to <strong>'+safe(challenge.phone || challenge.email)+'</strong>.</p><label class="field"><span>Verification code</span><input name="token" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,10}" required autofocus></label>';
   else if(mode==='password') content+=passwordField();
   else if(contacts) content+='<p>Verify your email and mobile number to finish registration. Both contacts stay on this account.</p>'+emailField(Boolean(user?.email))+phoneField();
   else if(mode==='forgot') content+=emailField();
   else if(signup) content+=(method==='mobile'?phoneField()+emailField():emailField()+phoneField())+passwordField()+'<p class="auth-hint">We verify your email first, then send an SMS code to your mobile. Both are required.</p><p class="auth-hint">By creating an account, you agree to the <a href="#terms" data-legal>Terms of Service</a> and acknowledge the <a href="#privacy" data-legal>Privacy Policy</a>.</p>';
   else content+=(method==='mobile'?phoneField():emailField()+passwordField());
   content+='<button class="button primary" type="submit">'+(signup?'Create account':verify?'Verify code':mode==='forgot'?'Send recovery code':contacts?'Continue verification':mode==='password'?'Save password':method==='mobile'?'Send SMS code':'Sign in')+icon('arrow')+'</button></form>';
   if(verify) content+='<button class="button quiet" id="resend">Resend code</button><button class="button quiet" data-mode="'+(user?'contacts':'login')+'">Use different details</button>';
   if(login&&method==='email') content+='<button class="button quiet" id="email-code">Sign in with an email code</button><button class="button quiet" data-mode="forgot">Forgot password?</button>';
   if(login||signup) content+='<div class="auth-divider"><span>or continue with</span></div><div class="auth-social">'+['google','apple'].map(provider=>'<button class="button secondary" data-provider="'+provider+'" '+(!providers[provider]?'disabled':'')+'>'+icon(provider,22)+provider[0].toUpperCase()+provider.slice(1)+'</button>').join('')+'</div>'+(!providers.google||!providers.apple?'<p class="auth-hint">'+[!providers.google?'Google':'',!providers.apple?'Apple':''].filter(Boolean).join(' and ')+' sign-in awaiting activation.</p>':'')+'<p class="auth-switch">'+(signup?'Already have an account?':'New to SeekGRNJobs?')+' <button class="text-button" data-mode="'+(signup?'login':'signup')+'">'+(signup?'Sign in':'Create account')+'</button></p>';
   if(contacts&&!providers.phone) content+='<p class="auth-hint">SMS verification is awaiting activation. Your registration remains incomplete until both contacts are verified.</p>';
  }
  dialog.innerHTML='<button type="button" class="button quiet sheet-close" aria-label="Close">'+icon('close')+'</button><div class="sheet-handle" aria-hidden="true"></div><div class="sheet-inner"><span class="eyebrow">SEEKGRNJOBS</span><h2 id="auth-title">'+titles[mode]+'</h2><p id="auth-message" role="status" aria-live="polite">'+safe(info)+'</p>'+content+'</div>';
  dialog.querySelector('.sheet-close').onclick=()=>dialog.close();
  dialog.querySelectorAll('[data-legal]').forEach(a=>a.onclick=()=>dialog.close());
  dialog.querySelectorAll('[data-mode]').forEach(button=>button.onclick=()=>{if(busy)return;capture();mode=button.dataset.mode;draw();});
  dialog.querySelectorAll('[data-method]').forEach(button=>button.onclick=()=>{if(busy)return;capture();method=button.dataset.method;draw();});
  dialog.querySelectorAll('[data-provider]').forEach(button=>button.onclick=()=>run(async()=>{
   capture();
   if(signup){phone=namibianPhone(phone);remember({oauth:true});}
   const {error}=await supabase.auth.signInWithOAuth({provider:button.dataset.provider,options:{redirectTo:location.origin+location.pathname}});
   if(error){sessionStorage.removeItem(pendingKey);throw error;}
  }));
  dialog.querySelector('#signout')?.addEventListener('click',()=>run(async()=>{
   const {error}=await supabase.auth.signOut();if(error)throw error;
   sessionStorage.removeItem(pendingKey);await refreshAccount();await onChange();dialog.close();
  }));
  dialog.querySelector('#email-code')?.addEventListener('click',()=>run(async()=>{
   capture();const field=dialog.querySelector('[name="email"]');if(!field.reportValidity())return;
   const {error}=await supabase.auth.signInWithOtp({email,options:{shouldCreateUser:false,emailRedirectTo:location.origin+location.pathname}});if(error)throw error;
   askCode({email,type:'email'},'login');
  }));
  dialog.querySelector('#resend')?.addEventListener('click',()=>run(resend));
  dialog.querySelector('#auth-form')?.addEventListener('submit',event=>{event.preventDefault();void run(()=>submit(new FormData(event.target)));});
  if(busy)dialog.querySelectorAll('button,input').forEach(el=>el.disabled=true);
 }
 function capture() {
  const form=dialog.querySelector('form');if(!form)return;
  const values=new FormData(form);if(values.has('email'))email=String(values.get('email')).trim().toLowerCase();if(values.has('phone'))phone=String(values.get('phone'));
 }
 async function run(work) {
  if(busy)return;busy=true;dialog.setAttribute('aria-busy','true');dialog.querySelectorAll('button').forEach(el=>el.disabled=true);
  try{await work();}catch(error){message(error.message || 'Unable to complete this request. Try again.');}
  finally{busy=false;dialog.removeAttribute('aria-busy');dialog.querySelectorAll('button,input').forEach(el=>el.disabled=false);dialog.querySelectorAll('[data-provider]').forEach(el=>el.disabled=!providers[el.dataset.provider]);}
 }
 function askCode(next,after) {challenge=next;afterVerify=after;resendAt=Date.now()+60000;mode='verify';draw();}
 async function attachPhone() {
  mode='contacts';draw();expectedUserId=user?.id;
  phone=await sendPhoneCode(supabase.auth,phone,providers.phone);
  askCode({phone,type:'phone_change'},'finish');
 }
 async function finish() {
  await refreshAccount();await onChange();
  if(!verifiedContacts(user)){mode='contacts';draw('Verify both contacts to finish registration.');return;}
  sessionStorage.removeItem(pendingKey);dialog.close();await onSuccess();
 }
 async function signedIn() {
  await refreshAccount();await onChange();
  if(registrationPending()){mode='contacts';email=user?.email||email;draw();return;}
  sessionStorage.removeItem(pendingKey);dialog.close();await onSuccess();
 }
 async function submit(data) {
  capture();const redirectTo=location.origin+location.pathname;
  if(mode==='signup') {
   const result=await registerAccount(supabase.auth,{email,phone,password:String(data.get('password')),redirectTo});
   email=result.email;phone=result.phone;remember({});
   if(result.session){await refreshAccount();await onChange();await attachPhone();}
   else askCode({email,type:'email'},'phone');
   return;
  }
  if(mode==='login') {
   if(method==='mobile') {
    if(!providers.phone)throw new Error('SMS sign-in is awaiting activation. Use email sign-in for now.');
    phone=namibianPhone(phone);const {error}=await supabase.auth.signInWithOtp({phone,options:{shouldCreateUser:false}});if(error)throw error;
    expectedUserId=undefined;askCode({phone,type:'sms'},'login');return;
   }
   const {error}=await supabase.auth.signInWithPassword({email,password:String(data.get('password'))});if(error)throw error;
   await signedIn();return;
  }
  if(mode==='contacts') {
   phone=namibianPhone(phone);remember({oauth:true});expectedUserId=user.id;
   if(!user.email) {
    const {error}=await supabase.auth.updateUser({email});if(error)throw error;
    askCode({email,type:'email_change'},'phone');
   } else {
    email=user.email;
    const {error}=await supabase.auth.signInWithOtp({email,options:{shouldCreateUser:false,emailRedirectTo:redirectTo}});if(error)throw error;
    askCode({email,type:'email'},'phone');
   }return;
  }
  if(mode==='forgot') {
   const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo});if(error)throw error;
   expectedUserId=undefined;askCode({email,type:'recovery'},'password');return;
  }
  if(mode==='verify') {
   await verifyContact(supabase.auth,challenge,String(data.get('token')),expectedUserId);
   await refreshAccount();await onChange();
   if(afterVerify==='phone'){await attachPhone();return;}
   if(afterVerify==='password'){mode='password';draw();return;}
   if(afterVerify==='finish'){await finish();return;}
   await signedIn();return;
  }
  if(mode==='password') {
   const {error}=await supabase.auth.updateUser({password:String(data.get('password'))});if(error)throw error;
   await signedIn();
  }
 }
 async function resend() {
  if(Date.now()<resendAt)throw new Error('Wait '+Math.ceil((resendAt-Date.now())/1000)+' seconds before requesting another code.');
  let result;
  if(challenge.type==='phone_change')result=await supabase.auth.resend({type:'phone_change',phone:challenge.phone});
  else if(challenge.type==='sms')result=await supabase.auth.signInWithOtp({phone:challenge.phone,options:{shouldCreateUser:false}});
  else if(challenge.type==='recovery')result=await supabase.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});
  else if(challenge.type==='email_change')result=await supabase.auth.resend({type:'email_change',email});
  else result=afterVerify==='phone'&&!user?await supabase.auth.resend({type:'signup',email}):await supabase.auth.signInWithOtp({email,options:{shouldCreateUser:false}});
  if(result.error)throw result.error;resendAt=Date.now()+60000;message('A new code has been sent.');
 }
 draw();dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});dialog.addEventListener('close',()=>{document.body.classList.remove('sheet-open');dialog.remove();});dialog.showModal();
}
