import {supabase,user,isAdmin,providers,refreshAccount} from './backend.js';
import {icon} from './icons.js';
import {namibianPhone,registerAccount,verifyContact,verifiedContacts,contactProgress,continueContactVerification} from './auth-service.js';

const safe = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pendingKey='seekgrn-registration';
function pendingRegistration(){try{return JSON.parse(sessionStorage.getItem(pendingKey))||{};}catch{return {};}}
export function registrationPending(){return Boolean(user&&!isAdmin&&!verifiedContacts(user));}

export function openAccount(onChange,initial='login',onSuccess=()=>{}){
 if(document.querySelector('.auth-sheet'))return;
 const pending=pendingRegistration();
 let mode=initial==='password'?'password':user?(initial==='contacts'&&!verifiedContacts(user)?'contacts':'account'):initial;
 let method='email',email=user?.email||pending.email||'',phone=user?.phone||pending.phone||user?.user_metadata?.contact_phone||'';
 let challenge,afterVerify,expectedUserId=user?.id||pending.userId,busy=false,busyLabel='',resendAt=0;
 const dialog=document.createElement('dialog');dialog.className='auth-sheet';dialog.setAttribute('aria-labelledby','auth-title');
 document.body.append(dialog);document.body.classList.add('sheet-open');
 const message=text=>{const node=dialog.querySelector('#auth-message');if(node)node.textContent=text;};
 const remember=()=>sessionStorage.setItem(pendingKey,JSON.stringify({email,phone,userId:user?.id||expectedUserId}));
 const phoneField=()=>'<label class="field"><span>Mobile number</span><span class="phone-input"><span class="phone-prefix">+264</span><input name="phone" aria-label="Mobile number" type="tel" inputmode="numeric" autocomplete="tel-national" placeholder="81 234 5678" value="'+safe(phone.replace(/^\+?264/,''))+'" required></span></label>';
 const emailField=(readonly=false)=>'<label class="field"><span>Email address</span><input name="email" type="email" autocomplete="email" value="'+safe(email)+'" '+(readonly?'readonly':'')+' required></label>';
 const passwordField=()=>'<label class="field"><span>Password</span><input name="password" type="password" autocomplete="'+(mode==='login'?'current-password':'new-password')+'" minlength="8" required></label>';
 function progress(){
  const state=contactProgress(user,phone);
  return '<ol class="verification-steps" aria-label="Contact verification">'+[['email','Email'],['mobile','Mobile']].map(([key,label],index)=>'<li class="'+(state[key]?'verified':'')+'"><span class="verification-circle" aria-hidden="true">'+(state[key]?icon('check',14):index+1)+'</span><span>'+label+'<small>'+(state[key]?'Verified':'Not verified')+'</small></span></li>').join('')+'</ol>';
 }
 function syncBusy(){
  dialog.setAttribute('aria-busy',String(busy));
  dialog.querySelectorAll('button').forEach(button=>button.disabled=busy||Boolean(button.dataset.provider&&!providers[button.dataset.provider]));
  const submit=dialog.querySelector('#auth-submit');
  if(submit)submit.innerHTML=busy?'<span class="auth-spinner" aria-hidden="true"></span>'+safe(busyLabel):safe(submit.dataset.label)+icon('arrow');
  const resend=dialog.querySelector('#resend');
  if(resend){
   const seconds=Math.max(0,Math.ceil((resendAt-Date.now())/1000));
   resend.disabled=busy||seconds>0;resend.textContent=busy&&busyLabel==='Resending code…'?'Resending…':seconds?'Resend in '+seconds+'s':'Resend code';
  }
  const signout=dialog.querySelector('#signout');if(signout)signout.textContent=busy?'Signing out…':'Sign out';
 }
 function setBusyLabel(label){busyLabel=label;syncBusy();}
 function draw(info=''){
  const signup=mode==='signup',login=mode==='login',verify=mode==='verify',contacts=mode==='contacts';
  const state=contactProgress(user,phone);
  const titles={login:'Welcome back.',signup:'Create your account.',forgot:'Reset your password.',verify:challenge?.phone?'Check your SMS.':'Check your email.',password:'Choose a new password.',contacts:state.email?'Verify your mobile.':'Verify your email.',account:'Your account.',complete:'Account verified.'};
  let content='';
  if(contacts||mode==='complete'||mode==='account'||(verify&&afterVerify==='contacts'))content+=progress();
  if(mode==='account'){
   content+='<div class="account-details"><p>'+safe(user?.email||'Email not added')+'</p><p>'+safe(user?.phone||'Mobile not added')+'</p></div>';
   if(!verifiedContacts(user))content+='<button class="button primary" data-mode="contacts">Complete contact verification '+icon('arrow')+'</button>';
   if(!isAdmin)content+='<a class="button secondary account-subscription" href="#subscription">'+icon('subscription')+'Subscription</a>';
   content+='<button class="button secondary" id="signout">Sign out</button>';
  }else{
   if(login||signup)content+='<div class="auth-tabs" role="group" aria-label="Sign-in method"><button type="button" data-method="email" aria-pressed="'+(method==='email')+'">'+icon('mail')+'Email</button><button type="button" data-method="mobile" aria-pressed="'+(method==='mobile')+'">'+icon('phone')+'Mobile</button></div>';
   content+='<form id="auth-form">';
   if(verify)content+='<p>Enter the '+(challenge.phone?'SMS':'email')+' code sent to <strong>'+safe(challenge.phone||challenge.email)+'</strong>.</p><label class="field"><span>Verification code</span><input name="token" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,10}" required autofocus></label>';
   else if(mode==='password')content+=passwordField();
   else if(mode==='complete')content+='<p>Your email and mobile number are verified. Your account is ready.</p>';
   else if(contacts){
    content+='<p>'+(state.email?'Your email is already verified. Send an SMS code to confirm your mobile number.':'Confirm your email first. We will then send the verification code to your mobile.')+'</p>';
    content+=state.email?'<p class="verified-contact">'+icon('check',16)+' '+safe(user.email)+'</p>':emailField(Boolean(user?.email));
    content+=phoneField();
   }else if(mode==='forgot')content+='<p>Enter your account email to receive a password-reset code.</p>'+emailField();
   else if(signup)content+=emailField()+'<div class="auth-pair">'+phoneField()+passwordField()+'</div><p class="auth-hint">With email signup: email code, then SMS.</p>';
   else content+=(method==='mobile'?phoneField():emailField()+passwordField());
   const label=signup?'Create account':verify?'Verify code':mode==='forgot'?'Send reset code':contacts?(state.email?'Send SMS code':'Send email code'):mode==='password'?'Save password':mode==='complete'?'Continue':method==='mobile'?'Send SMS code':'Sign in';
   content+='<button id="auth-submit" class="button primary" type="submit" data-label="'+label+'">'+label+icon('arrow')+'</button></form>';
   if(verify)content+='<div class="auth-utilities"><button type="button" class="text-button" id="resend">Resend code</button><button type="button" class="text-button" data-mode="'+(user?'contacts':'login')+'">Use different details</button></div>';
   if(login&&method==='email')content+='<div class="auth-utilities"><button type="button" class="text-button" data-mode="forgot">Forgot password?</button></div>';
   if(login||signup)content+='<div class="auth-divider"><span>or continue with</span></div><div class="auth-social">'+['google','apple'].map(provider=>'<button type="button" class="button secondary" data-provider="'+provider+'" '+(!providers[provider]?'disabled title="'+provider[0].toUpperCase()+provider.slice(1)+' sign-in coming soon"':'')+'>'+icon(provider,20)+provider[0].toUpperCase()+provider.slice(1)+'</button>').join('')+'</div><p class="auth-switch">'+(signup?'Already have an account?':'New to SeekGRNJobs?')+' <button type="button" class="text-button" data-mode="'+(signup?'login':'signup')+'">'+(signup?'Sign in':'Create account')+'</button></p>';
  }
  dialog.dataset.mode=mode;
  dialog.innerHTML='<button type="button" class="button quiet sheet-close" aria-label="Close">'+icon('close')+'</button><div class="sheet-handle" aria-hidden="true"></div><div class="sheet-inner"><div class="sheet-content"><h2 id="auth-title">'+titles[mode]+'</h2><p id="auth-message" role="status" aria-live="polite">'+safe(info)+'</p>'+content+'</div><p class="sheet-legal">By using the SeekGRNJobs app you agree to our <a href="#terms" data-legal>Terms of Service</a> &amp; <a href="#privacy" data-legal>Privacy Policy</a></p></div>';
  dialog.querySelector('.account-subscription')?.addEventListener('click',()=>dialog.close());
  dialog.querySelector('.sheet-close').onclick=()=>{if(!busy)dialog.close();};
  dialog.querySelectorAll('[data-legal]').forEach(link=>link.onclick=event=>{if(busy)event.preventDefault();else dialog.close();});
  dialog.querySelectorAll('[data-mode]').forEach(button=>button.onclick=()=>{if(busy)return;capture();mode=button.dataset.mode;draw();});
  dialog.querySelectorAll('[data-method]').forEach(button=>button.onclick=()=>{if(busy)return;capture();method=button.dataset.method;draw();});
  dialog.querySelectorAll('[data-provider]').forEach(button=>button.onclick=()=>run(async()=>{
   capture();remember();
   const {error}=await supabase.auth.signInWithOAuth({provider:button.dataset.provider,options:{redirectTo:location.origin+'/'}});
   if(error)throw error;
  },'Opening '+button.dataset.provider+'…'));
  dialog.querySelector('#signout')?.addEventListener('click',()=>run(async()=>{
   const {error}=await supabase.auth.signOut();if(error)throw error;
   sessionStorage.removeItem(pendingKey);sessionStorage.removeItem('seekgrn-action');await refreshAccount();dialog.close();await onChange();
  },'Signing out…'));
  dialog.querySelector('#resend')?.addEventListener('click',()=>run(resend,'Resending code…'));
  dialog.querySelector('[name=token]')?.addEventListener('input',event=>{event.target.value=event.target.value.replace(/\D/g,'');});
  dialog.querySelector('#auth-form')?.addEventListener('submit',event=>{
   event.preventDefault();const data=new FormData(event.currentTarget);
   void run(()=>submit(data),mode==='verify'?'Verifying…':mode==='forgot'?'Sending reset code…':mode==='password'?'Saving password…':mode==='signup'?'Creating account…':mode==='contacts'?(state.email?'Sending SMS…':'Sending email…'):mode==='complete'?'Opening your workspace…':method==='mobile'?'Sending SMS…':'Signing in…');
  });
  syncBusy();
 }
 function capture(){
  const form=dialog.querySelector('form');if(!form)return;
  const values=new FormData(form);if(values.has('email'))email=String(values.get('email')).trim().toLowerCase();if(values.has('phone'))phone=String(values.get('phone'));
 }
 async function run(work,label){
  if(busy)return;busy=true;busyLabel=label;syncBusy();message(label);
  try{await work();}
  catch(error){message(error.message||'Unable to complete this request. Please try again.');}
  finally{busy=false;syncBusy();}
 }
 function askCode(next,after){
  challenge=next;afterVerify=after;resendAt=Date.now()+60000;mode='verify';
  draw('Code sent. Enter it below.');
 }
 async function nextContact(){
  if(!user?.id)throw new Error('Sign in again to continue verification.');
  email=user.email||email;
  phone=phone||user.phone||user.user_metadata?.contact_phone||'';
  expectedUserId=user.id;remember();
  if(contactProgress(user,phone).next==='complete'){mode='complete';sessionStorage.removeItem(pendingKey);draw();await onChange();return;}
  mode='contacts';draw();
  // Collect a missing number before attempting delivery. Never resend email
  // when Auth already records it as confirmed.
  if(!phone)return;
  setBusyLabel(contactProgress(user,phone).email?'Sending SMS…':'Sending email…');
  const result=await continueContactVerification(supabase.auth,user,{email,phone,redirectTo:location.origin+'/'});
  if(result.complete){mode='complete';draw();return;}
  if(result.challenge.phone)phone=result.challenge.phone;
  askCode(result.challenge,'contacts');
 }
 async function signedIn(){
  await refreshAccount();await onChange();
  email=user?.email||email;phone=user?.phone||user?.user_metadata?.contact_phone||phone;
  if(registrationPending()){mode='contacts';draw();return;}
  sessionStorage.removeItem(pendingKey);dialog.close();await onSuccess();
 }
 async function submit(data){
  capture();const redirectTo=location.origin+'/';
  if(mode==='signup'){
   const result=await registerAccount(supabase.auth,{email,phone,password:String(data.get('password')),redirectTo});
   email=result.email;phone=result.phone;expectedUserId=result.user?.id;remember();
   if(result.session){await refreshAccount();await nextContact();}
   else askCode({email,type:'email'},'contacts');
   return;
  }
  if(mode==='login'){
   if(method==='mobile'){
    phone=namibianPhone(phone);const {error}=await supabase.auth.signInWithOtp({phone,options:{shouldCreateUser:false}});
    if(error)throw error;expectedUserId=undefined;askCode({phone,type:'sms'},'login');return;
   }
   const {error}=await supabase.auth.signInWithPassword({email,password:String(data.get('password'))});
   if(error){
    if(error.code==='email_not_confirmed'){
     const result=await supabase.auth.resend({type:'signup',email});if(result.error)throw result.error;
     expectedUserId=undefined;askCode({email,type:'email'},'contacts');return;
    }
    throw error;
   }
   await signedIn();return;
  }
  if(mode==='contacts'){phone=namibianPhone(phone);await nextContact();return;}
  if(mode==='forgot'){
   const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo});if(error)throw error;
   expectedUserId=undefined;askCode({email,type:'recovery'},'password');return;
  }
  if(mode==='verify'){
   await verifyContact(supabase.auth,challenge,String(data.get('token')),expectedUserId);
   await refreshAccount();
   if(afterVerify==='contacts'){await nextContact();return;}
   if(afterVerify==='password'){mode='password';draw();return;}
   await signedIn();return;
  }
  if(mode==='password'){
   const {error}=await supabase.auth.updateUser({password:String(data.get('password'))});if(error)throw error;
   await signedIn();return;
  }
  if(mode==='complete'){sessionStorage.removeItem(pendingKey);dialog.close();await onSuccess();}
 }
 async function resend(){
  if(Date.now()<resendAt)throw new Error('Please wait before requesting another code.');
  let result;
  if(challenge.type==='phone_change')result=await supabase.auth.resend({type:'phone_change',phone:challenge.phone});
  else if(challenge.type==='sms')result=await supabase.auth.signInWithOtp({phone:challenge.phone,options:{shouldCreateUser:false}});
  else if(challenge.type==='recovery')result=await supabase.auth.resetPasswordForEmail(challenge.email,{redirectTo:location.origin+'/'});
  else if(challenge.type==='email_change')result=await supabase.auth.resend({type:'email_change',email:challenge.email});
  else result=afterVerify==='contacts'&&!user?await supabase.auth.resend({type:'signup',email:challenge.email}):await supabase.auth.signInWithOtp({email:challenge.email,options:{shouldCreateUser:false}});
  if(result.error)throw result.error;resendAt=Date.now()+60000;message('A new '+(challenge.phone?'SMS':'email')+' code has been sent.');
 }
 const timer=setInterval(()=>{if(!busy&&dialog.isConnected)syncBusy();},1000);
 draw();dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
 dialog.addEventListener('close',()=>{clearInterval(timer);document.body.classList.remove('sheet-open');dialog.remove();});
 dialog.showModal();
}
