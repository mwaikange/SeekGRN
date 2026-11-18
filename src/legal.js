const pages={
 terms:{title:'Terms of Service',intro:'SeekGRNJobs is owned and managed by Mwai PaySME Solutions cc.',sections:[
  ['Using this service','SeekGRNJobs is an independent application preparation tool for Namibia’s Public Service. It is not a government recruitment office and does not guarantee employment or submit applications on your behalf.'],
  ['Your account','Provide accurate contact details, protect your account and use only your own information or information you are authorised to manage. Verify your email and mobile number when registering.'],
  ['Preparing an application','Check every vacancy against the official circular. Review all generated forms, sign where required and submit the required documents to the office specified in the circular before its deadline. You remain responsible for accuracy, eligibility and timely delivery.'],
  ['Availability and content','Circulars, closing dates and service availability can change. Automated PDF extraction may miss or misread information. Always use the official circular to resolve any discrepancy.'],
  ['Acceptable use','Do not impersonate another person, attempt unauthorised access, upload malicious files or misuse verification messages. Access may be restricted where needed to protect accounts and the service.'],
  ['Contact and changes','For account, support or terms enquiries, contact mwaikange@gmail.com. Updated terms will be published on this page.']
 ]},
 privacy:{title:'Privacy Policy',intro:'Mwai PaySME Solutions cc operates SeekGRNJobs and manages the information provided through this service.',sections:[
  ['Information you provide','We process your email, mobile number, sign-in information, applicant profile, uploaded documents, signature and prepared application forms. Profiles may contain identity, employment and health information when you enter those details.'],
  ['How we use information','We use your information to verify your account, save your profile, generate the forms you request and let you retrieve or share your application packs. We do not automatically send your applications to government offices.'],
  ['Service providers','Supabase provides authentication and account storage. Vercel hosts the website. SMSPortal delivers verification messages when SMS is enabled. Google or Apple processes the sign-in request if you choose that provider. These providers may process information outside Namibia.'],
  ['Storage and your choices','Your account data is stored until you remove it or request account deletion, subject to provider backup retention and any applicable legal requirements. Clear profile and documents in your profile to remove those saved records. Contact mwaikange@gmail.com for access, correction, export or account deletion requests.'],
  ['Security and browser storage','Account access is restricted by authentication and database permissions. The browser stores sign-in sessions and temporary registration details so you can continue verification. Signing out removes the active session from that browser. Avoid shared devices for sensitive documents.'],
  ['Sharing documents','When you choose to download or share an application pack, you control the destination. The receiving service or person handles their copy under their own arrangements.'],
  ['Contact and changes','Send privacy enquiries to mwaikange@gmail.com. Changes to this policy will be published here.']
 ]}
};
export function legalPage(kind){const page=pages[kind];return '<article class="wrap legal-page"><span class="eyebrow">SEEKGRNJOBS · UPDATED 18 NOVEMBER 2026</span><h1>'+page.title+'</h1><p>'+page.intro+'</p>'+page.sections.map(([title,text])=>'<section><h2>'+title+'</h2><p>'+text+'</p></section>').join('')+'<a class="button secondary" href="#browse">Back to vacancies</a></article>';}
