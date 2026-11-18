export const APP_NAME='SeekGRNJobs';
export const INVOICE_PREFIX='SEEKGRN';
export const PAYMENT_CURRENCY='NAD';
export const PAYSME_RETURN_URL='https://www.paysme.site/payment/return';
export const PAYSME_SHARED_WEBHOOK_URL='https://merchant-webhook.paysme.app/webhook/00000000-1986-0026-0000-000000000001';
export const APP_OPEN_URL='https://seek-grn.vercel.app/#subscription';
export const APP_ICON_URL='https://seek-grn.vercel.app/icon.svg';
export function isAppInvoice(value){return typeof value==='string'&&(/^SEEKGRN-[A-F0-9]{7}$/.test(value)||/^SG-[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value));}
export const returnInvoiceKey='seekgrn-return-invoice';
export function capturePaymentReturn(location,storage){
 const params=new URL(location.href).searchParams;
 if(!params.has('invoice_id'))return null;
 const invoice=params.get('invoice_id');
 if(!isAppInvoice(invoice)){storage.removeItem(returnInvoiceKey);return null;}
 storage.setItem(returnInvoiceKey,invoice);return invoice;
}
export function pendingReturnInvoice(storage){const invoice=storage.getItem(returnInvoiceKey);return isAppInvoice(invoice)?invoice:null;}
export function hostedPaymentUrl(checkout){
 const url=new URL('https://paysme.site/pay/'+encodeURIComponent(checkout.vendor_uuid));
 for(const [k,v] of Object.entries({invoice_id:checkout.invoice_id,amount:checkout.amount_nad,product_name:APP_NAME+' subscription',mobile:checkout.mobile,email:checkout.email,town:checkout.town,redirect_url:PAYSME_RETURN_URL}))url.searchParams.set(k,String(v));
 return url.href;
}
