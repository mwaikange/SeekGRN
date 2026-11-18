# SeekGRNJobs subscription activation

The Subscription page, PaySME SMS checkout, verified payment webhook and database-enforced allowances are implemented. Existing users, passwords, identities and admin memberships are preserved. These changes do not automatically migrate the live database or configure your PaySME merchant.

## Packages and counting

| Package | Payment | Allowance | Saving versus N$50/month |
| --- | --- | --- | --- |
| Monthly | N$50 per month | 20 preparations/month | — |
| Biannually | N$240 upfront for six months (N$40/month) | 30 preparations/month | N$60 / 20% |
| Annually | N$360 upfront for twelve months (N$30/month) | Unlimited | N$240 / 40% |

Every account gets one lifetime free preparation, including subscribers. Paid quota is used first, then the free preparation if still available. One preparation is the employment form plus health questionnaire (and a disclosure supplement when needed) for one vacancy. Re-preparing or downloading that same vacancy never uses another allowance. Clearing/removing documents does not refund usage. Existing saved packs are grandfathered and do not consume the new free preparation. Admin membership is checked server-side through app_admins: unlimited free access, no Subscription icon, and no subscription purchase.

Allowances reset on monthly anniversaries anchored to the paid term start, using calendar months. Unused quota does not roll over. A renewal or package change queues after the current paid term; no automatic recurring debit is set up. Each term requires a separate confirmed payment.

## 1. Apply the database migration

Paste all of scripts/subscriptions.sql into the EXISTING SeekGRNJobs project's SQL Editor. It creates subscription_orders, subscription_terms and form_preparations; RLS permits users to read only their own records. Public clients cannot change plans, payment state or counters. The migration backfills existing packs without charging them, then adds a guard against saving new packs outside the allowance RPC. Existing document viewing, sharing, removal and profile edits remain supported. Run the migration before testing new form preparation on the updated website.

The save_prepared_pack RPC charges the allowance and persists the encoded pack in one transaction. A failed save consumes nothing. Per-user transaction locks prevent concurrent requests overspending quota. RPC permissions and the existing app_admins membership—not editable profile metadata—determine access.

## 2. Configure Vercel server environment

Set these values privately in the seek-grn Vercel project's Production environment, then redeploy:

| Name | Source |
| --- | --- |
| PAYSME_MERCHANT_ID | UUID-format Merchant ID from the SeekGRNJobs merchant's generated integration snippet |
| PAYSME_API_KEY | Matching merchant integration API key from that snippet |
| PAYSME_WEBHOOK_SECRET | Merchant webhook signing secret |
| SUPABASE_URL | https://dmrtrkhjlarjzhaxyflf.supabase.co |
| SUPABASE_SERVICE_ROLE_KEY | Server-only service-role key for the SeekGRNJobs project |

Never use the human-readable Vendor ID, SMSPortal credentials or a facilitator password in place of the PaySME Merchant ID/API key. Never prefix a signing secret or service-role key with VITE_. The SDK intentionally receives the public merchant integration pair; signing secrets and database service-role credentials stay server-side. Missing merchant configuration leaves payment creation unavailable rather than simulating a successful SMS/payment.

Use merchant tax settings that preserve the advertised N$50/N$240/N$360 final price (prices include VAT, or do not charge VAT, as appropriate for your business). Do not enable add-VAT-on-top without revising the quoted price and amount-matching policy. The app does not calculate VAT.

## 3. Register the PaySME webhook

In the SeekGRNJobs PaySME merchant portal Profile → Webhook URL, set:

    https://seek-grn.vercel.app/api/paysme-webhook

Save its matching signing secret as PAYSME_WEBHOOK_SECRET above. The endpoint verifies HMAC-SHA256 over the untouched raw body using X-PaySME-Signature: sha256=<hex>. Only signed payment.paid events with status paid, currency NAD, matching merchant, exact saved invoice amount and a unique transaction activate a term. Replays return success without extending access again. Unknown invoices and mismatches are rejected; temporary processing failures return a retryable error. Never activate a package from a redirect, SDK SMS callback or client-edited status.

The return URL is https://seek-grn.vercel.app/#subscription. Returning only refreshes server status.

## 4. SDK and Expo wrapper

The app loads https://www.paysme.site/sdk/v1/paysme.js once when checkout is requested. The package's Pay via PaySME button opens the town/details step, then the official SDK-rendered Create Payment Request button sends the payment link by SMS. Its official branding and exact Request to Pay Sent. Check your SMS. notice are retained. No facilitator modal is opened inside the app. Mobile and email come from the authenticated verified account; the SDK and backend use one stable invoice/idempotency key for retries.

When the SDK cannot load within ten seconds, Open secure checkout offers the guide's hosted checkout route. This fallback does not claim an SMS was sent. When the user returns from an SMS/system browser, focus/visibility refreshes the server subscription. No native JavaScript message or deep-link query can mark an account paid.

For the later Expo wrapper, enable JavaScript/HTTPS, permit the stable PaySME host and open SMS/payment links in the system browser or approved in-app browser. Preserve normal SDK HTTP revalidation and safe-area padding. There is no native Expo wrapper project in this repository yet. Store distribution must use the billing route applicable to the digital subscription and market; this web checkout does not establish app-store approval.

## 5. Validation

Run npm test and npm run build. Payment tests use mocks and send no SMS or money. For the optional isolated PostgreSQL migration/allowance checks, install @electric-sql/pglite in a temporary directory and set SEEKGRN_PGLITE_MODULE to its absolute dist/index.js file URL before running node scripts/check-subscriptions.mjs. This runs against a fresh in-memory database, never the live project. The optional scripts/check-subscription-ui.mjs also needs playwright-core installed under install-cache/subscription-runtime, a local Vite server, and an available Edge/Chromium executable (SEEKGRN_BROWSER can override its path). Its Auth, SDK and payment calls are mocked.

After configuration, use a regular account: verify the free pack, quota limits, admin exemption, and SMS request flow. A payment request must remain pending until the signed merchant webhook arrives. Check retry/replay behaviour, wrong invoice/amount rejection, renewal dates, status refresh after returning from the payment browser, and narrow-phone layout. Live handset delivery and paid activation need your real merchant configuration; automated tests do not prove them.

Verified in this update: 43 unit/integration tests, an isolated PostgreSQL run including migration rerun and quota/payment checks, and an in-app browser review with no horizontal overflow at 320, 360, 390, 768 and 1280 CSS pixels. The standalone headless Edge runner could not launch in this environment; its automated SDK click-through result is unverified. Real merchant checkout and paid activation remain untested until configuration.
