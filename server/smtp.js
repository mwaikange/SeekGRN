export function smtpOptions(env) {
 const port=Number(env.SMTP_PORT||465);
 if(!env.SMTP_HOST||!env.SMTP_USER||!env.SMTP_PASS||!Number.isInteger(port)||port<1||port>65535)throw new Error('SMTP is not configured.');
 if(env.SMTP_SECURE!==undefined&&!['true','false'].includes(env.SMTP_SECURE))throw new Error('SMTP_SECURE must be true or false.');
 const secure=env.SMTP_SECURE===undefined?port===465:env.SMTP_SECURE==='true';
 return {host:env.SMTP_HOST,port,secure,requireTLS:!secure,auth:{user:env.SMTP_USER,pass:env.SMTP_PASS},
  connectionTimeout:8000,greetingTimeout:8000,socketTimeout:10000,tls:{minVersion:'TLSv1.2'},disableFileAccess:true,disableUrlAccess:true};
}

export function createSmtpSender({env=process.env,transportFactory}={}) {
 return async message=>{
  const options=smtpOptions(env);
  const factory=transportFactory||(await import('nodemailer')).default.createTransport;
  const transport=factory(options);
  try{return await transport.sendMail(message);}
  finally{transport.close?.();}
 };
}
