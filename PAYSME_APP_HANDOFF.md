# SeekGRNJobs shared PaySME registration

| Field | Value |
| --- | --- |
| App name | SeekGRNJobs |
| Permanent invoice prefix | SEEKGRN |
| New invoice format | SEEKGRN-8A2DD90 (seven random uppercase hexadecimal characters) |
| Icon | https://seek-grn.vercel.app/icon.svg |
| App-opening URL | https://seek-grn.vercel.app/#subscription |
| Central return URL | https://www.paysme.site/payment/return |
| Shared merchant webhook | https://merchant-webhook.paysme.app/webhook/00000000-1986-0026-0000-000000000001 |
| SEEKGRN signed-event destination | https://seek-grn.vercel.app/api/paysme-webhook |
| Currency | NAD |

Register this record in PaySME's central returnApps list (also served at https://seek-grn.vercel.app/paysme-app.json):

```json
{
  "name": "SeekGRNJobs",
  "invoicePrefix": "SEEKGRN",
  "icon": "https://seek-grn.vercel.app/icon.svg",
  "openUrl": "https://seek-grn.vercel.app/#subscription"
}
```

The central page can use new URL(openUrl).searchParams.set('invoice_id', invoiceId), producing:

    https://seek-grn.vercel.app/?invoice_id=SEEKGRN-8A2DD90#subscription

This is the web app-opening URL. It does not invent a native Expo scheme; a native deep link can replace it when the wrapper is built and its link handling is tested. Signed-out users sign in first, then the app fetches the owned invoice's status. No return flag or native message activates a subscription.

The shared router must preserve the original HMAC-signed body or sign the forwarded body with the receiver's configured secret. Forward event payment.paid with status paid, invoice_id, merchant_id, transaction_id, amount and currency. Keep invoice IDs unchanged on retry, and route outstanding SG legacy invoices to SeekGRN only if present. Never put secrets in this registration file.

The app verifies signature, merchant, stored app prefix, invoice, amount and currency; repeat deliveries are applied once. The invoice is saved with its user, selected plan, expected amount, NAD currency and app identity before starting the SDK.

Integration blockers observed: the shared webhook hostname returned ENOTFOUND from this environment; the central returnApps list in inspected PaySME source was empty. This change prepares the SeekGRN side and supplies its registration; it does not claim shared-host DNS, routing or central registry configuration were deployed. The current SMS SDK request transport also omits redirect_url, so PaySME's hosted SMS checkout must use the central return configuration.
