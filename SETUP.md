# SeekGRNJobs authentication setup

These are manual steps for the existing **SeekGRnJobs** project `dmrtrkhjlarjzhaxyflf`. No Supabase database, account or Auth configuration was changed during this update.

## 1. Preserve your existing super admin

Your confirmed `mwaikange@gmail.com` account already exists and already has the only `app_admins` membership. Keep that account and its password. Do not delete it or create a duplicate.

Paste all of [scripts/existing-super-admin.sql](scripts/existing-super-admin.sql) into Supabase SQL Editor and run it. It is safe to run again. It preserves the user, existing password, identities and applicant data, adds the `super_admin` app metadata label, remembers `+264818083704` for later verification, and constrains `app_admins` to that one user. If another admin membership exists, the transaction stops without removing it. Existing circular policies already check membership in this table, so no duplicate circular policies or new tables are needed.

Expected result: your email, role `super_admin`, contact phone `+264818083704`, and `can_upload_psm = true`. Phone confirmation remains empty until a real SMS OTP is verified. Sign out and back in after running the script. Existing admin access remains usable while SMS is awaiting activation. No temporary password is required.

## 2. Change confirmation links into email codes

In **Authentication → Email Templates**, paste [supabase/templates/otp.html](supabase/templates/otp.html) into each of:

- Confirm signup
- Magic Link (also used for email code sign-in and social signup contact verification)
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
6. From the app, sign in with email, open My account → Verify contact details, complete email OTP and then SMS OTP. Confirm the same Auth user has both `email_confirmed_at` and `phone_confirmed_at`. Test wrong and expired codes too. Then test mobile sign-in for that account.

The hook uses SMSPortal v3 `BulkMessages` and Basic authentication. No SMS was sent and no credit was consumed in development tests. Actual delivery requires the credentials and activation above. [SMSPortal quickstart](https://docs.smsportal.com/docs/quickstart) · [Supabase Send SMS hook](https://supabase.com/docs/guides/auth/auth-hooks/send-sms-hook).

## 4. Apple sign-in

Apple uses Supabase's Apple provider. Configure the Apple Developer Services ID, team/key credentials and callback `https://dmrtrkhjlarjzhaxyflf.supabase.co/auth/v1/callback`, then enable Apple in Supabase. The button automatically becomes available when the provider is enabled. Social signup still requires the contact verification screens; provider email is used for the email code, including an Apple relay email when selected.

## 5. Google sign-in — final setup

1. Open [Google Cloud Console](https://console.cloud.google.com/apis/credentials), select/create the project and configure the Google Auth Platform branding, audience and consent screen for SeekGRNJobs. Add test users if the app is in Testing.
2. Create an **OAuth client ID → Web application**.
3. Add authorised JavaScript origin `https://seek-grn.vercel.app`. For local development add the actual origin, such as `http://localhost:5173`.
4. Add this exact **Authorised redirect URI**: `https://dmrtrkhjlarjzhaxyflf.supabase.co/auth/v1/callback`.
5. Copy Client ID and Client Secret into **Supabase → Authentication → Sign In / Providers → Google**, and enable Google. Do not put the Client Secret in the repository or frontend environment.
6. Confirm the app URL is allowed in Supabase URL Configuration (step 2). Reload SeekGRNJobs; the Google button reads the enabled provider setting automatically.
7. Test Google signup and return to the app. Complete the email and mobile OTP steps. Check that the same Auth user owns both verified contacts. Publish the Google consent app when ready to allow public users.

[Official Supabase Google setup](https://supabase.com/docs/guides/auth/social-login/auth-google)
