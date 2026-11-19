import {PAYSME_TOWNS} from './paysme-towns.js';

export function selectedTown(town) {
  if (!PAYSME_TOWNS.includes(town)) throw new Error('Choose your town from the list.');
  return town;
}

export function namibianPhone(value) {
  let digits = String(value ?? '').replace(/[\s()-]/g, '');
  if (digits.startsWith('+264')) digits = digits.slice(4);
  else if (digits.startsWith('264')) digits = digits.slice(3);
  if (digits.startsWith('0')) digits = digits.slice(1);
  if (!/^8\d{8}$/.test(digits)) throw new Error('Enter your nine-digit Namibian mobile number, for example 818083704.');
  return '+264' + digits;
}

export function verifiedContacts(account) {
  return Boolean(account?.email && account.email_confirmed_at && account.phone && account.phone_confirmed_at);
}

export function contactProgress(account, enteredPhone = account?.phone || '') {
  const email = Boolean(account?.email && account.email_confirmed_at);
  let mobile = Boolean(account?.phone && account.phone_confirmed_at);
  if (mobile) {
    try { mobile = namibianPhone(enteredPhone) === namibianPhone(account.phone); }
    catch { mobile = false; }
  }
  return {email, mobile, next: !email ? 'email' : !mobile ? 'mobile' : 'complete'};
}

// Use confirmed Auth fields, including provider-confirmed email, rather than
// editable user metadata or a browser flag from a previous OAuth attempt.
export async function continueContactVerification(auth, account, {email, phone, town, redirectTo}) {
  if (!account?.id) throw new Error('Sign in again to verify your contact details.');
  const step = contactProgress(account, phone).next;
  if (step === 'complete') return {complete: true};
  if (step === 'mobile') {
    const number = await sendPhoneCode(auth, phone, town);
    return {challenge: {phone: number, type: 'phone_change'}};
  }
  let result, challenge;
  if (!account.email) {
    result = await auth.updateUser({email});
    challenge = {email, type: 'email_change'};
  } else {
    result = await auth.signInWithOtp({email: account.email, options: {shouldCreateUser: false, emailRedirectTo: redirectTo}});
    challenge = {email: account.email, type: 'email'};
  }
  if (result.error) throw result.error;
  return {challenge};
}

// Email is the initial identity for every registration. Attach the phone only
// after email confirmation so both contacts belong to the same Auth user.
export async function registerAccount(auth, {email, phone, town, password, redirectTo}) {
  const contact = {email: email.trim().toLowerCase(), phone: namibianPhone(phone), town: selectedTown(town)};
  const result = await auth.signUp({email: contact.email, password,
    options: {emailRedirectTo: redirectTo, data: {contact_phone: contact.phone, checkout_town: contact.town}}});
  if (result.error) throw result.error;
  if (result.data.user?.identities?.length === 0) throw new Error('An account may already use this email. Sign in or reset your password.');
  return {...result.data, ...contact};
}

export async function sendPhoneCode(auth, value, town) {
  const phone = namibianPhone(value);
  const {error} = await auth.updateUser({phone, data: {checkout_town: selectedTown(town)}});
  if (error) throw error;
  return phone;
}

export async function verifyContact(auth, challenge, token, expectedUserId) {
  const {data, error} = await auth.verifyOtp({...challenge, token: token.trim()});
  if (error) throw error;
  if (expectedUserId && data?.user?.id !== expectedUserId) {
    await auth.signOut();
    throw new Error('Your account changed during verification. Please sign in again.');
  }
  return data;
}
