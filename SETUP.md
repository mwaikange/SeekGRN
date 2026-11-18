# SeekGRNJobs authentication setup

These are manual steps for the existing **SeekGRnJobs** project `dmrtrkhjlarjzhaxyflf`. No Supabase database, account or Auth configuration was changed during this update.

## 1. Preserve your existing super admin

Your confirmed `mwaikange@gmail.com` account already exists and already has the only `app_admins` membership. Keep that account and its password. Do not delete it or create a duplicate.

Paste all of [scripts/existing-super-admin.sql](scripts/existing-super-admin.sql) into Supabase SQL Editor and run it. It is safe to run again. It preserves the user, existing password, identities and applicant data, adds the `super_admin` app metadata label, remembers `+264818083704` for later verification, and constrains `app_admins` to that one user. If another admin membership exists, the transaction stops without removing it. Existing circular policies already check membership in this table, so no duplicate circular policies or new tables are needed.

Expected result: your email, role `super_admin`, contact phone `+264818083704`, and `can_upload_psm = true`. Phone confirmation remains empty until a real SMS OTP is verified. Sign out and back in after running the script. Existing admin access remains usable while SMS is awaiting activation. No temporary password is required.

## 2. Change confirmation links into email codes

In **Authentication → Email Templates**, paste [supabase/templates/otp.html](supabase/templates/otp.html) into each of:

- Confirm signup
- Magic Link (used when an existing unconfirmed email needs verification)
- Reset Password
- Change Email Address

Use subject **Your SeekGRNJobs verification code**. The required variable is `{{ .Token }}`. The frontend accepts numeric OTPs; changing JavaScript alone cannot change hosted email templates. Keep email confirmation enabled. Configure custom SMTP for delivery to public users; the built-in sender has recipient and rate restrictions. In **Authentication → URL Configuration**, set Site URL to `https://seek-grn.vercel.app` and allow `https://seek-grn.vercel.app/` and your specific development/preview redirect URLs.

## 3. Connect SMSPortal — revised using the supplied guide

Follow [SMS_SETUP.md](SMS_SETUP.md) for the complete replacement. Run scripts/sms-logs.sql, then replace BOTH index.ts and handler.js in the existing smsportal-otp Edge Function and deploy with Verify JWT OFF. Keep the existing function URL and the three SMSPortal/hook secrets. Supabase supplies the built-in server variables for audit writes.

The sender now uses https://rest.smsportal.com/v1/bulkmessages, Basic authentication and +264 destination format. Supabase still generates and verifies the OTP. Audit rows use the existing app_admins role and omit OTP/message bodies and full phone numbers. The script stops rather than overwriting an incompatible existing sms_logs table.

Use scripts/test-smsportal.ps1 for a private test-mode provider check. It sends no actual message unless -Live is explicitly selected. Do not test an unlinked number through logged-out phone-only sign-in: sign into its existing email account first, then request verification of that account's mobile.

## 4. Apple sign-in

Apple uses Supabase's Apple provider. Configure the Apple Developer Services ID, team/key credentials and callback `https://dmrtrkhjlarjzhaxyflf.supabase.co/auth/v1/callback`, then enable Apple in Supabase. The button automatically becomes available when the provider is enabled. Social signup accepts the server-confirmed provider email, including an Apple relay email. A separate email code is not sent for an already confirmed email. The mobile number still requires SMS verification.

## Contact-verification flow

- Email/password signup: confirm the email OTP, see the email check mark, then the app sends the SMS OTP to the number supplied at signup.
- Google/Apple: an email confirmed by Auth is already verified. Collect the mobile number and send only the SMS OTP. Do not trust editable metadata as verification.
- Returning users with both contacts confirmed sign in normally. Email OTP is used for forgotten-password recovery, email confirmation or a newly added email; it is not resent simply to verify an already confirmed mobile.
- Verification steps show Email and Mobile status, explicit Sending/Verifying labels, a spinner and resend cooldown. A failed SMS send stays on the mobile step and displays the real error.
- The client does not use a missing/cached Phone provider setting to suppress SMS requests. If the backend rejects a send, check that Phone authentication and the Send SMS hook are both enabled; function secrets alone do not activate either.
- Admin circular management has one entry point: the signed-in Admin navigation tab. It is not part of the account/verification sheet.

## Account-removal request email through SMTP (Vercel)

The public removal page posts to /api/account-removal. The server emails only support@paysme.site and uses the applicant email as Reply-To. It never deletes accounts automatically.

Add these server-only Vercel environment variables from your email hosting account:

| Variable | Value |
| --- | --- |
| SMTP_HOST | Your provider’s SMTP server hostname |
| SMTP_PORT | 465 for implicit TLS, or 587 for STARTTLS |
| SMTP_SECURE | true for 465; false for 587 |
| SMTP_USER | Your SMTP mailbox/login |
| SMTP_PASS | Your SMTP password or app password |
| SMTP_FROM | SeekGRNJobs <support@paysme.site>, or an authorised sender |

Redeploy after adding them. Do not put SMTP credentials in browser variables or prefix them with VITE_. SMSPortal secrets stay only in Supabase. Existing email authentication continues using Supabase’s own SMTP configuration; Vercel credentials are for the removal form.

The transport requires TLS and keeps certificate verification enabled. Missing credentials, rejection and timeouts produce a clear error; success is reported only when the SMTP server accepts the support recipient. Automated tests use mock delivery and send no real email. After setup, send one real removal request and confirm its receipt in the support mailbox.

The endpoint validates input and same-origin requests, has a honeypot and best-effort instance-local throttling, and blocks duplicate clicks while sending. SMTP acceptance does not guarantee inbox delivery and SMTP does not provide API idempotency guarantees.

## 5. Google sign-in - final setup

1. Open [Google Cloud Console](https://console.cloud.google.com/apis/credentials), select/create the project and configure the Google Auth Platform branding, audience and consent screen for SeekGRNJobs. Add test users if the app is in Testing.
2. Create an **OAuth client ID → Web application**.
3. Add authorised JavaScript origin `https://seek-grn.vercel.app`. For local development add the actual origin, such as `http://localhost:5173`.
4. Add this exact **Authorised redirect URI**: `https://dmrtrkhjlarjzhaxyflf.supabase.co/auth/v1/callback`.
5. Copy Client ID and Client Secret into **Supabase → Authentication → Sign In / Providers → Google**, and enable Google. Do not put the Client Secret in the repository or frontend environment.
6. Confirm the app URL is allowed in Supabase URL Configuration (step 2). Reload SeekGRNJobs; the Google button reads the enabled provider setting automatically.
7. Test Google signup and return to the app. The provider-confirmed email should show a check mark. Complete the mobile SMS OTP step. Check that the same Auth user owns both verified contacts. Publish the Google consent app when ready to allow public users.

[Official Supabase Google setup](https://supabase.com/docs/guides/auth/social-login/auth-google)
