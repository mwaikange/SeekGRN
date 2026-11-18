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

// Email is the initial identity for every registration. Attach the phone only
// after email confirmation so both contacts belong to the same Auth user.
export async function registerAccount(auth, {email, phone, password, redirectTo}) {
  const contact = {email: email.trim().toLowerCase(), phone: namibianPhone(phone)};
  const result = await auth.signUp({email: contact.email, password,
    options: {emailRedirectTo: redirectTo, data: {contact_phone: contact.phone}}});
  if (result.error) throw result.error;
  if (result.data.user?.identities?.length === 0) throw new Error('An account may already use this email. Sign in or reset your password.');
  return {...result.data, ...contact};
}

export async function sendPhoneCode(auth, value, enabled) {
  if (!enabled) throw new Error('SMS verification is awaiting activation. Your number has not been verified.');
  const phone = namibianPhone(value);
  const {error} = await auth.updateUser({phone});
  if (error) throw error;
  return phone;
}

export async function verifyContact(auth, challenge, token, expectedUserId) {
  const {data, error} = await auth.verifyOtp({...challenge, token: token.trim()});
  if (error) throw error;
  if (expectedUserId && data.user?.id !== expectedUserId) {
    await auth.signOut();
    throw new Error('Your account changed during verification. Please sign in again.');
  }
  return data;
}
