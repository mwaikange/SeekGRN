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

## 3. Shared PaySME webhook and central return

This merchant profile is shared with other apps. Keep its merchant-wide webhook set to:

    https://merchant-webhook.paysme.app/webhook/00000000-1986-0026-0000-000000000001

Do not replace that merchant-wide URL with the app-specific receiver. The shared router must forward only SEEKGRN invoice events to:

    https://seek-grn.vercel.app/api/paysme-webhook

The receiver still requires X-PaySME-Signature: sha256=<hex>, HMAC-SHA256 over the unchanged raw JSON body, using the configured PAYSME_WEBHOOK_SECRET. If the router reserializes the body, it must sign the forwarded bytes with the matching secret. It must forward the documented payment.paid event, status paid, merchant_id, invoice_id, transaction_id, amount and currency. Do not downgrade verification to trusting a URL flag, a bare forwarding header or an SMS callback. Existing SG-UUID invoice events remain accepted for older saved obligations; configure a temporary SG route for outstanding SeekGRN-only legacy invoices if any exist. All new references use SEEKGRN-seven uppercase hexadecimal characters.

The subscription receiver matches the stored app prefix, invoice, amount and currency, then applies the payment once. Replays do not extend access again. Other apps cannot claim a SeekGRN invoice. No fulfilment is performed by the return page.

Central return URL for SDK checkout configuration and the hosted fallback:

    https://www.paysme.site/payment/return

The current PaySME Request-to-Pay SDK transport does not send redirect_url in its SMS request body. The app passes the requested central return configuration, and the fallback URL includes it; the shared PaySME hosted SMS checkout must also be configured to use the central return page. This app does not fork or alter the shared SDK.

At verification time, merchant-webhook.paysme.app did not resolve from this environment (ENOTFOUND); no successful live forwarding or signed payment delivery is claimed. PaySME's central return registry was also empty in the inspected source. Register SeekGRNJobs there using public/paysme-app.json or the record in PAYSME_APP_HANDOFF.md. Shared DNS, routing, signing and central registration must be operational for end-to-end activation and app return.

### Existing deployments: short-reference migration

If scripts/subscriptions.sql was already run, run scripts/payment-return-update.sql before testing payment callbacks on this release. It adds app/currency fields, changes new reference generation, and updates the payment RPC to verify currency. It preserves saved invoices and subscriptions. If subscriptions have not been installed, run the complete updated scripts/subscriptions.sql instead.

New references such as SEEKGRN-8A2DD90 are reserved in the database before checkout. A seven-character collision retries against the unique invoice primary key. Retries for an existing pending obligation keep its original reference, including pre-existing SG references. A new paid term receives a new reference. Never rename an invoice already sent to PaySME.

The central page appends invoice_id to the registered app-opening URL. SeekGRN saves that reference through sign-in and requests /api/subscription-status with the signed-in user's bearer token. The lookup filters both invoice and user; another account sees no payment details. Redirect status flags cannot mark an order paid. The app displays only the stored backend payment state and refreshes its actual subscription entitlement.

## 4. SDK and Expo wrapper

The app loads https://www.paysme.site/sdk/v1/paysme.js once when checkout is requested. The package's Pay via PaySME button opens the town/details step, then the official SDK-rendered Create Payment Request button sends the payment link by SMS. Its official branding and exact Request to Pay Sent. Check your SMS. notice are retained. No facilitator modal is opened inside the app. Mobile and email come from the authenticated verified account; the SDK and backend use one stable invoice/idempotency key for retries.

When the SDK cannot load within ten seconds, Open secure checkout offers the guide's hosted checkout route. This fallback does not claim an SMS was sent. When the user returns from an SMS/system browser, focus/visibility refreshes the server subscription. No native JavaScript message or deep-link query can mark an account paid.

For the later Expo wrapper, enable JavaScript/HTTPS, permit the stable PaySME host and open SMS/payment links in the system browser or approved in-app browser. Preserve normal SDK HTTP revalidation and safe-area padding. There is no native Expo wrapper project in this repository yet. Store distribution must use the billing route applicable to the digital subscription and market; this web checkout does not establish app-store approval.

## 5. Validation

Run npm test and npm run build. Payment tests use mocks and send no SMS or money. For the optional isolated PostgreSQL migration/allowance checks, install @electric-sql/pglite in a temporary directory and set SEEKGRN_PGLITE_MODULE to its absolute dist/index.js file URL before running node scripts/check-subscriptions.mjs. This runs against a fresh in-memory database, never the live project. The optional scripts/check-subscription-ui.mjs also needs playwright-core installed under install-cache/subscription-runtime, a local Vite server, and an available Edge/Chromium executable (SEEKGRN_BROWSER can override its path). Its Auth, SDK and payment calls are mocked.

After configuration, use a regular account: verify the free pack, quota limits, admin exemption, and SMS request flow. A payment request must remain pending until the signed merchant webhook arrives. Check retry/replay behaviour, wrong invoice/amount rejection, renewal dates, status refresh after returning from the payment browser, and narrow-phone layout. Live handset delivery and paid activation need your real merchant configuration; automated tests do not prove them.

Verified in this update: 43 unit/integration tests, an isolated PostgreSQL run including migration rerun and quota/payment checks, and an in-app browser review with no horizontal overflow at 320, 360, 390, 768 and 1280 CSS pixels. The standalone headless Edge runner could not launch in this environment; its automated SDK click-through result is unverified. Real merchant checkout and paid activation remain untested until configuration.
