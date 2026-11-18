# SeekGRNJobs SMSPortal integration

This replaces the provider sender using the supplied SMS_INTEGRATION_GUIDE.md: v1 REST endpoint, Basic authentication, +264 destinations, and queued/result audit records. The existing Supabase Auth hook remains responsible for sending Auth-generated OTPs. Supabase still verifies the codes and links the verified mobile to the same user.

## 1. Add audit storage

Paste [scripts/sms-logs.sql](scripts/sms-logs.sql) into the existing project's SQL Editor and run it. It creates public.sms_logs with admin-only reads through the existing app_admins table and server-only writes. It does not change users, passwords, admin memberships or application data.

The script stops and rolls back if a differently structured sms_logs table or unrelated access policy already exists. In that case, share that table's schema before adapting the script; do not delete it.

The table stores the user ID, last four phone digits, status, provider HTTP status, documented error identifiers and a limited provider summary. It never stores plaintext OTPs, full phone numbers, SMS bodies, credentials or the provider's Sample/free-text fields.

Statuses are queued, accepted, failed and unknown. Accepted means the API accepted the message; it does not prove handset delivery. Unknown means a timeout or unreadable response prevented confirmation. Audit failures appear in function logs and do not block or repeat a valid OTP request.

## 2. Replace the existing function's two files

In Supabase → Edge Functions → smsportal-otp → Code, replace both files with:

- [index.ts](supabase/functions/smsportal-otp/index.ts)
- [handler.js](supabase/functions/smsportal-otp/handler.js)

Deploy with **Verify JWT OFF**. The function authenticates signed Supabase Auth webhooks instead; ordinary browser calls and unsigned test requests cannot send messages.

Keep the hook URL:

    https://dmrtrkhjlarjzhaxyflf.supabase.co/functions/v1/smsportal-otp

Do not change the hook into a general-purpose browser send-sms endpoint. The sample guide's free-form message example does not generate or verify a Supabase Auth OTP. The app continues to use updateUser({phone}) for an authenticated account's phone verification, signInWithOtp({phone, options:{shouldCreateUser:false}}) for an existing phone login, and verifyOtp for the result.

## 3. Check configuration

The existing custom secrets remain:

| Secret | Value |
| --- | --- |
| SMSPORTAL_CLIENT_ID | Client ID for an active SMSPortal REST API key |
| SMSPORTAL_API_SECRET | Matching API secret, not the control-panel password |
| SEND_SMS_HOOK_SECRET | Existing complete Auth hook signing secret |

The function also uses Supabase's built-in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for audit writes. Do not copy a service-role key into the app or Vercel frontend variables.

Ensure Phone authentication and the Send SMS hook are enabled. Keep phone confirmation enabled, production test OTP numbers disabled, and the SMS resend interval/rate limits enabled. Check SMSPortal API-key activation, credit and any IP whitelist restrictions.

No SMSPortal credentials belong in Vercel. The separate SMTP settings in Vercel are only for account-removal emails.

## 4. Test the REST credentials without sending an SMS

Run from PowerShell:

    .\scripts\test-smsportal.ps1

It prompts locally for the REST Client ID and API Secret. The default uses SMSPortal testMode=true, so it does not send a message or consume credits. It reports only HTTP status and documented error codes. It does not print the credentials or raw provider response.

For a deliberate single handset-delivery test, the optional -Live switch sends a labelled test message to the selected number and may consume SMS credit. That message is not an Auth login code. The script does not create an account or mark a contact verified.

## 5. Test the actual account OTP

1. Sign in to the existing email/Google account. A number that is not yet linked cannot be tested through logged-out phone-only sign-in with account creation disabled.
2. Open My account → Complete contact verification. The confirmed email should show a check mark.
3. Enter the mobile number and press Send SMS code once.
4. On success, enter the received code. Only a successful Auth verifyOtp response marks the mobile verified.
5. If it fails, inspect the most recent sms_logs row using the SELECT at the end of sms-logs.sql, or open Edge Functions → smsportal-otp → Logs. Copy the code, provider_http_status and provider_response.error_codes. An old PUT /auth/v1/user gateway event alone does not include the provider reason.

## Diagnostic references

| Reference | Meaning |
| --- | --- |
| SMS-CREDITS | SMSPortal reported InsufficientCredits |
| SMS-AUTH | InvalidCredentials or an authentication error; also HTTP 401 |
| SMS-ACCESS | HTTP 403 without a more specific documented code |
| SMS-NUMBER | DestinationAddress.Invalid |
| SMS-ROUTE | No route for the destination network |
| SMS-OPTOUT | Destination opted out |
| SMS-DUPLICATE | Provider detected a duplicate |
| SMS-REQUEST | HTTP 400 request validation error |
| SMS-RATE-LIMIT | HTTP 429 |
| SMS-PROVIDER | Other provider HTTP error |
| SMS-REJECTED | Provider reported message errors |
| SMS-TIMEOUT / SMS-NETWORK / SMS-RESPONSE | Delivery cannot be confirmed; no automatic retry |
| SMS-AUDIT | Audit write failed; inspect SQL/configuration, with delivery outcome recorded separately in function logs |
| SMS-ACCEPTED | API accepted the message; check SMSPortal delivery reports if the handset receives nothing |

## Validation boundaries

Automated tests use mock providers and audit storage. They cover payload shape, number formats, signed-hook rejection, error-code interpretation, logging order, failure handling, and exclusion of OTPs/secrets from logs. They send no actual SMS. Hosted secrets, the SQL migration, function deployment and live handset delivery require the manual steps above.

References: [SMSPortal REST quickstart](https://docs.smsportal.com/docs/quickstart), [REST error codes](https://docs.smsportal.com/docs/rest-error-codes), [Send SMS Auth hook](https://supabase.com/docs/guides/auth/auth-hooks/send-sms-hook).
