const safe = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function removalPage(user) {
 return `<article class="wrap legal-page removal-page"><span class="eyebrow">ACCOUNT SUPPORT</span><h1>Request account removal</h1>
 <p>Ask Mwai PaySME Solutions cc to remove your SeekGRNJobs account and saved applicant information. You can request removal without signing in.</p>
 <div class="panel form-panel"><form id="removal-form">
 <label class="field"><span>Full name</span><input name="name" autocomplete="name" maxlength="120" required></label>
 <label class="field"><span>Account email address</span><input name="email" type="email" autocomplete="email" maxlength="254" value="${safe(user?.email)}" required></label>
 <label class="field"><span>Account mobile number (optional)</span><input name="phone" type="tel" autocomplete="tel" maxlength="24" placeholder="+264 83 679 5150" value="${safe(user?.phone)}"></label>
 <label class="field"><span>Additional information (optional)</span><textarea name="reason" maxlength="2000" placeholder="For example, if you no longer have access to your account email."></textarea></label>
 <div class="form-trap" aria-hidden="true"><label>Leave this empty<input name="website" tabindex="-1" autocomplete="off"></label></div>
 <label class="removal-consent"><input name="consent" type="checkbox" required> I am requesting removal of my own account and understand that saved profiles and application packs will be deleted after ownership is verified.</label>
 <p class="subtle">Do not include your password, OTP, ID number, medical information or documents. Support will verify account ownership before deletion. This request does not immediately delete your account.</p>
 <button class="button primary" type="submit">Send removal request</button><p id="removal-status" role="status" aria-live="polite"></p>
 </form></div><section><h2>What will be removed?</h2><p>After verifying your request, support will remove your sign-in account, saved applicant profile, signature and application packs. Copies already downloaded or shared remain with you or their recipients. Limited records may be retained where legally necessary, and backup copies expire according to the applicable retention schedule.</p><h2>Need help?</h2><p>Email <a href="mailto:support@paysme.site">support@paysme.site</a> or call <a href="tel:+264836795150">+264 83 679 5150</a>. You can also send your request directly by email.</p></section><a class="button secondary" href="/#browse">Back to vacancies</a></article>`;
}

export async function submitRemoval(event) {
 event.preventDefault();
 const form=event.currentTarget, button=form.querySelector('button[type=submit]'), status=form.querySelector('#removal-status');
 if(button.disabled)return;
 button.disabled=true;status.textContent='Sending your request…';
 const values=Object.fromEntries(new FormData(form));values.consent=form.elements.consent.checked;
 try {
  const response=await fetch('/api/account-removal',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(values),signal:AbortSignal.timeout(30000)});
  const result=await response.json();
  if(!response.ok)throw new Error(result.error||'Your request could not be sent. Please email support@paysme.site.');
  status.textContent='Your request has been sent to support@paysme.site. Support will contact you to verify ownership before removing your account.';
  form.reset();button.textContent='Request sent';
 } catch(error) {
  status.textContent=error.name==='TimeoutError'?'Delivery could not be confirmed. Please email support@paysme.site or try again.':error.message;
  button.disabled=false;
 }
}
