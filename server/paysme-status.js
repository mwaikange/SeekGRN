const TRANSACTIONS_URL = 'https://zvoqrqdnuupdefsuiurt.supabase.co/rest/v1/transactions';

export function closedInvoiceStatus(status) {
  if (status === 'expired') return status;
  if (status === 'cancelled' || status === 'canceled') return 'cancelled';
  return null;
}

// An unconfirmed, missing or still payable invoice must keep the purchase lock.
export async function readClosedInvoice(env, order, fetcher = fetch) {
  const key = env.PAYSME_TRANSACTION_READ_KEY?.trim();
  if (!key || !env.PAYSME_MERCHANT_ID?.trim()) return null;
  const url = new URL(TRANSACTIONS_URL);
  url.search = new URLSearchParams({
    select: 'status,amount',
    merchant_id: 'eq.' + env.PAYSME_MERCHANT_ID.trim(),
    invoice_id: 'eq.' + order.invoice_id,
    limit: '2'
  });
  const headers = {apikey: key};
  if (key.startsWith('eyJ')) headers.Authorization = 'Bearer ' + key;
  const response = await fetcher(url, {headers, signal: AbortSignal.timeout(4000), cache: 'no-store'});
  if (!response.ok) throw new Error('PaySME transaction status is unavailable.');
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length !== 1 || Number(rows[0]?.amount) !== Number(order.amount)) return null;
  return closedInvoiceStatus(rows[0].status);
}
