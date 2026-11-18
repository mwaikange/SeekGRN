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

## 3. Connect SMSPortal

The SMSPortal integration is a Supabase **Send SMS Auth Hook**. Supabase generates and verifies the OTP; the server function only delivers it. Its endpoint rejects requests without a valid Supabase hook signature. API credentials never belong in Vite variables or browser code.

1. In SMSPortal, activate a REST API key and copy its Client ID and API Secret. Ensure the account has credit and supports delivery to Namibian numbers.
2. In Supabase **Edge Functions**, create a function named `smsportal-otp`. Copy both files from [supabase/functions/smsportal-otp](supabase/functions/smsportal-otp): `index.ts` and `handler.js`. Deploy with **Verify JWT disabled** for this hook endpoint. The function verifies its webhook signature instead. The repository's `supabase/config.toml` includes that setting for a future CLI deployment.
3. In **Authentication → Hooks**, add a **Send SMS** HTTP hook with URL `https://dmrtrkhjlarjzhaxyflf.supabase.co/functions/v1/smsportal-otp`. Generate/copy its signing secret. Keep the hook disabled until the function secrets are saved.
4. In **Edge Functions → Secrets**, add these exact names privately:

   | Name | Value |
   | --- | --- |
   | `SMSPORTAL_CLIENT_ID` | SMSPortal Client ID |
   | `SMSPORTAL_API_SECRET` | SMSPortal API Secret |
   | `SEND_SMS_HOOK_SECRET` | Full generated Supabase hook signing secret |

5. Enable the Send SMS hook and **Authentication → Sign In / Providers → Phone**. Keep phone confirmation enabled. The custom hook delivers messages instead of the default SMS provider. Do not set phone auto-confirm or fixed test OTPs in production. Set OTP expiry and resend limits appropriate to the service (for example, five minutes and at least 60 seconds).
6. From the app, sign in and open My account → Complete contact verification. An already confirmed email should show a check mark; send only the mobile SMS code in that case. Confirm the same Auth user has both email_confirmed_at and phone_confirmed_at. Test wrong and expired codes too, then test mobile sign-in.

The hook uses SMSPortal v3 `BulkMessages` and Basic authentication. No SMS was sent and no credit was consumed in development tests. Actual delivery requires the credentials and activation above. [SMSPortal quickstart](https://docs.smsportal.com/docs/quickstart) · [Supabase Send SMS hook](https://supabase.com/docs/guides/auth/auth-hooks/send-sms-hook).

### Fix an Invalid payload sent to hook error when adding a phone

The hook must read user.new_phone for a pending mobile number; phone_change is the database field name, while Auth serializes it as new_phone. The handler keeps the old field as a compatibility fallback and reads user.phone for normal mobile sign-in. It does not read a phone from editable user metadata.

In Supabase → Edge Functions → smsportal-otp → Code, replace only handler.js with the repository version and deploy the function again. Leave index.ts, the three existing secrets and the Send SMS hook URL unchanged. Keep Verify JWT OFF; the function verifies the webhook signature. No SQL or account changes are needed.

A GitHub/Vercel deployment updates the website but does not deploy this Supabase function. Retest Send SMS code after saving the new function version. Signed validation/delivery failures use the structured Auth error envelope so the app can show the error; unsigned requests still receive HTTP 401.

### Diagnose a 502 while sending an SMS

A gateway log for PUT /auth/v1/user only shows that Auth failed. It does not include the SMSPortal HTTP response. Replace handler.js with the complete repository file and deploy the Supabase function, then press Send SMS code once. Copy the reference code displayed in the app, or the new matching JSON entry from Edge Functions → smsportal-otp → Logs. No index.ts or secret changes are needed.

| Reference | Meaning / next check |
| --- | --- |
| SMS-AUTH (HTTP 401/403 in function logs) | Authentication or API access rejected. Check the active REST key and its matching Client ID/Secret; check any IP whitelist restrictions. |
| SMS-REQUEST (HTTP 400) | Provider request validation failed. |
| SMS-RATE-LIMIT (HTTP 429) | Wait and check API rate limits. |
| SMS-PROVIDER | Provider HTTP failure; check the logged status. |
| SMS-REJECTED | HTTP succeeded but the provider reported message errors. Inspect account credit, sending permissions and the provider's own records. |
| SMS-TIMEOUT / SMS-NETWORK | Sending could not be confirmed. Do not automatically retry: the provider may already have received the message. |
| SMS-RESPONSE | Provider response could not be read or validated; delivery is unconfirmed. |
| SMS-ACCEPTED | The API accepted the request; check SMSPortal delivery reports if the handset receives nothing. |

Diagnostic entries include a component field of smsportal-otp, a code, stage and numeric httpStatus where available. Logs never include OTPs, phone numbers, credentials or raw request/response bodies.

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
