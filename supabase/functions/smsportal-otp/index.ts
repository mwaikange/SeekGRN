import {Webhook} from 'https://esm.sh/standardwebhooks@1.0.0';
import {smsPortalHandler} from './handler.js';

const hookSecret=Deno.env.get('SEND_SMS_HOOK_SECRET')?.replace(/^v1,whsec_/, '');
const webhook=hookSecret?new Webhook(hookSecret):null;
Deno.serve(smsPortalHandler({
 verify:webhook?(payload:string,headers:Record<string,string>)=>webhook.verify(payload,headers):null,
 clientId:Deno.env.get('SMSPORTAL_CLIENT_ID'),
 apiSecret:Deno.env.get('SMSPORTAL_API_SECRET')
}));
