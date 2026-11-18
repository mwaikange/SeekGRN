const pages={
  "terms": {
    "title": "Terms of Service",
    "intro": "SeekGRNJobs is owned and managed by Mwai PaySME Solutions cc in Namibia. These terms apply to the website and its mobile app wrapper.",
    "sections": [
      [
        "Using this service",
        "SeekGRNJobs is an independent application preparation tool for Namibia’s Public Service. It is not affiliated with a government recruitment office. It does not guarantee employment or submit applications on your behalf. By using the service, you agree to these terms."
      ],
      [
        "Your account",
        "Provide accurate email and mobile details and complete the required verification. Keep passwords and verification codes private. Use your own applicant information or information you have permission to manage, and tell support if you suspect account misuse. Google and Apple sign-in are available only when enabled."
      ],
      [
        "Your applicant information",
        "You are responsible for the information and documents you provide. You allow us to process them to verify your account, save your profile and prepare the forms you request. Enter sensitive health details and upload your signature only if you want them included in your forms. We do not sell your applicant information."
      ],
      [
        "Preparing and submitting applications",
        "Check each vacancy against the official circular. Automated PDF extraction may miss or misread information. Review every generated form, sign where required, and deliver the required documents to the office in the circular before its deadline. You remain responsible for accuracy, eligibility and submission."
      ],
      [
        "Acceptable use",
        "Do not impersonate others, access accounts without permission, upload malicious content, misuse verification messages, interfere with the service or publish confidential information without authority. We may restrict access to address misuse or protect accounts. Contact support to query an access restriction."
      ],
      [
        "Availability and responsibility",
        "Connectivity, service outages and errors may affect availability or output. Verify official deadlines and keep your own copies of important documents. To the extent permitted by applicable law, we are not responsible for recruitment decisions, missed submissions or loss caused by inaccurate information you supply. Nothing in these terms removes rights or responsibilities that cannot lawfully be excluded."
      ],
      [
        "Account removal",
        "Use Request Account Removal or contact support to request deletion. We verify ownership before removing an account, profile, signature and saved application packs. Downloads and copies shared with others are outside our control. Limited records may be retained where legally required and backups may expire later."
      ],
      [
        "Contact, updates and applicable law",
        "Contact support@paysme.site or +264 83 679 5150. These terms are governed by the laws of Namibia, subject to any mandatory rights that apply. Changes will be published with an updated date; material changes will be communicated through the service where practicable."
      ]
    ]
  },
  "privacy": {
    "title": "Privacy Policy",
    "intro": "This policy applies to SeekGRNJobs, its website and mobile app wrapper, account registration, applicant profiles, application and health forms, and account support. It does not describe unrelated PaySME vendor, merchant or payment services. SeekGRNJobs is owned and managed by Mwai PaySME Solutions cc in Namibia.",
    "sections": [
      [
        "Account and contact information",
        "We collect your email address, Namibian mobile number, account identifier, chosen sign-in method and contact verification status. We use passwords or one-time codes to authenticate access and verify your contact details. Never send passwords or verification codes to support."
      ],
      [
        "Applicant and sensitive information",
        "Your profile may include your name, identity or passport number, date of birth, address, contact details, citizenship, employment history, qualifications, languages, references and declarations. If you complete the health questionnaire, we process the health information you enter. You may also upload a completed form or signature. Prepared application and health PDFs contain the details you choose to include. Enter only information needed for your application and avoid providing another person’s details without permission."
      ],
      [
        "App activity and device access",
        "We process account access, request timing, error and security information needed to operate, protect and troubleshoot the service. When you choose to upload a document or signature, the file picker is used for that action. Downloads and sharing use the destination you select. The current application preparation features do not require background access to your contacts, SMS inbox, microphone or location."
      ],
      [
        "Why we use information",
        "We use account information to authenticate you and protect access, applicant details to save your profile and prepare forms, and support messages to resolve enquiries or removal requests. We process information to provide the service you request, with your permission for optional details you submit, and where necessary for security or legal obligations. We do not automatically submit applications to employers and do not sell applicant data or use it for advertising profiles."
      ],
      [
        "Storage and sessions",
        "Saved profiles and application packs are linked to your account. Your browser or app web view stores a sign-in session and temporary registration details so you can continue verification. Signing out ends the local session and clears the applicant workspace from view. Downloaded files may remain on your device. Use a trusted device and sign out when finished."
      ],
      [
        "Retention and removal",
        "We keep your account, saved profiles and application packs as needed to provide the service, until you clear those records or request removal. Clear profile and documents removes saved applicant records without deleting your sign-in account. Request Account Removal is available without signing in. Support verifies ownership before deleting the account and associated saved applicant data. Limited support, security or legal records may be retained where necessary to resolve disputes, prevent misuse or meet legal obligations. Deleted records may remain in backups until they expire under the applicable retention schedule. We do not promise immediate deletion from backups."
      ],
      [
        "Support and removal requests",
        "The removal form collects your name, account email, optional mobile number and explanation, and your confirmation. It sends these details to support@paysme.site for ownership checks and follow-up. Do not include identity documents, health details or passwords. Sending a request does not itself delete an account. We will respond through your account contact details and explain any verification or retention requirements."
      ],
      [
        "Your choices and security",
        "Contact us to request access, correction, an export or removal of your information, or to raise an objection or privacy concern. We verify identity before disclosing or deleting account data. Authentication, access permissions and encrypted connections help protect information, but no system can guarantee absolute security. Use a trusted device and keep your own copies of important forms."
      ],
      [
        "Sharing your forms",
        "When you download or share an application pack, you choose its destination. Recipients and other apps control the copies they receive. Removing your account does not remove documents already downloaded, emailed, printed or shared."
      ],
      [
        "Children and authorised use",
        "SeekGRNJobs is intended for people preparing their own public-service job applications and people authorised to help them. Do not create an account for a child or provide another person’s sensitive information unless you have lawful authority to do so. Contact support if you believe information has been provided without appropriate authority."
      ],
      [
        "Responsible entity, contact and changes",
        "SeekGRNJobs is operated by Mwai PaySME Solutions cc in Namibia. For privacy or account requests, contact support@paysme.site or +264 83 679 5150. We may update this notice when the service or law changes. The revised effective date will appear here, and material changes will be communicated through the service where practicable."
      ]
    ]
  }
};
export function legalPage(kind){const page=pages[kind];return '<article class="wrap legal-page"><span class="eyebrow">SEEKGRNJOBS · UPDATED 18 NOVEMBER 2026</span><h1>'+page.title+'</h1><p>'+page.intro+'</p>'+page.sections.map(([title,text])=>'<section><h2>'+title+'</h2><p>'+text+'</p></section>').join('')+'<p><a href="/request-account-removal">Request Account Removal</a> · <a href="mailto:support@paysme.site">support@paysme.site</a> · <a href="tel:+264836795150">+264 83 679 5150</a></p><a class="button secondary" href="/#browse">Back to vacancies</a></article>';}
