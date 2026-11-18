import {supabase,user,providers,refreshAccount} from './backend.js';
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function openAccount(onChange, initial='login') {
 let mode=initial==='password'?'password':user?'account':initial;
 let email='', phone='', otpType='email';
 const dialog=document.createElement('dialog');dialog.className='auth-sheet';
 document.body.append(dialog);
 function draw() {
 const account=mode==='account',signup=mode==='signup',forgot=mode==='forgot',verify=mode==='verify',password=mode==='password',mobile=mode==='mobile';
 dialog.innerHTML='<button type="button" class="button quiet sheet-close" aria-label="Close">×</button><div class="sheet-inner"><span class="eyebrow">SEEKGRNJOBS ACCOUNT</span><h2>'+({login:'Welcome back',signup:'Create your account',forgot:'Reset your password',verify:'Enter verification code',password:'Choose a new password',mobile:'Verify your mobile number',account:'Your account'})[mode]+'</h2><p id="auth-message" role="status"></p>'+
 (account?'<p>'+safe(user.email)+'</p><p>Mobile: '+safe(user.phone||'Not verified')+'</p><button class="button primary" data-mode="mobile">Verify mobile number</button><button class="button secondary" id="signout">Sign out</button>':
 '<form id="auth-form">'+
 (!verify&&!password&&!mobile?'<label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" required value="'+safe(email)+'"></label>':'')+
 ((mode==='login'||signup||password)?'<label class="field"><span>Password</span><input name="password" type="password" autocomplete="'+(mode==='login'?'current-password':'new-password')+'" minlength="8" required></label>':'')+
 (mobile?'<p>Use international format, for example +264818083704.</p><label class="field"><span>Mobile number</span><input name="phone" type="tel" autocomplete="tel" pattern="\+[1-9][0-9]{7,14}" required></label>':'')+
 (verify?'<p>Enter the code sent to '+safe(otpType==='phone_change'?phone:email)+'. If your email contains a link, open it to continue.</p><label class="field"><span>Verification code</span><input name="token" inputmode="numeric" autocomplete="one-time-code" required pattern="[0-9]{6,10}"></label>':'')+
 '<button class="button primary" type="submit">'+(forgot?'Send reset email':verify?'Verify code':signup?'Create account':mobile?'Send SMS code':password?'Save password':'Sign in')+'</button></form>')+
 (mode==='login'||signup?'<div class="auth-links"><button class="button secondary" id="google" '+(!providers.google?'disabled':'')+'>Continue with Google</button>'+(!providers.google?'<small>Google sign-in is not available yet.</small>':'')+'<button class="button quiet" data-mode="'+(signup?'login':'signup')+'">'+(signup?'Already registered? Sign in':'Create an account')+'</button><button class="button quiet" data-mode="forgot">Forgot password?</button></div>':'')+
 (mobile&&!providers.phone?'<p>SMS verification is awaiting activation. Your number will only be marked verified after a valid SMS code.</p>':'')+'</div>';
 dialog.querySelector('.sheet-close').onclick=()=>dialog.close();
 dialog.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;draw();});
 const message=s=>dialog.querySelector('#auth-message').textContent=s;
 dialog.querySelector('#signout')?.addEventListener('click',async()=>{
  const {error}=await supabase.auth.signOut();if(error){message(error.message);return;}
  await refreshAccount();dialog.close();await onChange();
 });
 dialog.querySelector('#google')?.addEventListener('click',async()=>{
  const {error}=await supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+location.pathname}});
  if(error)message(error.message);
 });
 dialog.querySelector('#auth-form')?.addEventListener('submit',async e=>{
  e.preventDefault();const data=new FormData(e.target);const button=e.target.querySelector('button');button.disabled=true;
  try {
   let result;
   if(data.get('email'))email=String(data.get('email')).trim();
   const redirectTo=location.origin+location.pathname;
   if(mode==='login')result=await supabase.auth.signInWithPassword({email,password:String(data.get('password'))});
   if(mode==='signup') {
    result=await supabase.auth.signUp({email,password:String(data.get('password')),options:{emailRedirectTo:redirectTo}});
    if(result.error)throw result.error;
    if(!result.data.session){mode='verify';otpType='email';draw();message('Check your email to confirm your account.');return;}
   }
   if(mode==='forgot') {
    result=await supabase.auth.resetPasswordForEmail(email,{redirectTo});
    if(result.error)throw result.error;
    mode='verify';otpType='recovery';draw();message('Check your email for the password reset link or code.');return;
   }
   if(mode==='mobile') {
    if(!providers.phone)throw new Error('SMS verification is not enabled yet.');
    phone=String(data.get('phone')).trim();
    result=await supabase.auth.updateUser({phone});
    if(result.error)throw result.error;
    mode='verify';otpType='phone_change';draw();return;
   }
   if(mode==='verify') {
    result=await supabase.auth.verifyOtp({...otpType==='phone_change'?{phone}:{email},token:String(data.get('token')),type:otpType});
    if(result.error)throw result.error;
    if(otpType==='recovery'){mode='password';draw();return;}
   }
   if(mode==='password')result=await supabase.auth.updateUser({password:String(data.get('password'))});
   if(result?.error)throw result.error;
   await refreshAccount();await onChange();
   if(user&&!user.phone&&mode!=='password'){mode='mobile';draw();}else dialog.close();
  }catch(error){message(error.message);}finally{button.disabled=false;}
 });
 }
 draw();dialog.addEventListener('close',()=>dialog.remove());dialog.showModal();
}
