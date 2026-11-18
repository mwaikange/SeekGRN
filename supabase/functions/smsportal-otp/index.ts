import {Webhook} from 'https://esm.sh/standardwebhooks@1.0.0';
import {smsPortalHandler,createSmsAudit} from './handler.js';

const secret=Deno.env.get('SEND_SMS_HOOK_SECRET')?.trim().replace(/^v1,whsec_/,'');
const webhook=secret?new Webhook(secret):null;
Deno.serve(smsPortalHandler({
 verify:webhook?(payload:string,headers:Record<string,string>)=>webhook.verify(payload,headers):null,
 clientId:Deno.env.get('SMSPORTAL_CLIENT_ID'),
 apiSecret:Deno.env.get('SMSPORTAL_API_SECRET'),
 audit:createSmsAudit({
  url:Deno.env.get('SUPABASE_URL'),
  key:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
 })
}));
