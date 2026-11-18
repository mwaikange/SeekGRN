# SeekGRNJobs

SeekGRNJobs helps applicants browse official Namibian Public Service vacancies and prepare form 156043 and health questionnaire 156094. Applicants review, sign and submit their forms through the office specified in the circular.

## Run locally

Use Node.js 22 or later. Run `npm ci`, then `npm run dev`. Run `npm test` for the circular and form checks and `npm run build` for a production build.

## Vercel and Supabase

The `seek-grn` Vercel project is linked to `mwaikange/SeekGRN`. Deployments run the circular and form checks before building Vite. The repository includes the official blank forms and the circular PDF. The default client configuration points to the existing SeekGRnJobs Supabase project. Use the variables in `.env.example` only to select a different project or rotate the publishable key. Keep secret and service-role keys out of the web build.

In Supabase Authentication → URL Configuration, set the Site URL to the production Vercel URL and add each approved preview or development redirect URL. Configure SMTP for public signup and recovery email. To send codes in the account confirmation and password reset emails, add the `{{ .Token }}` variable to their templates. Configure a Google OAuth client and an SMS provider in Supabase to activate those sign-in and verification flows.

The confirmed account for `mwaikange@gmail.com` receives the Upload PSM tab. Open it, choose a circular with selectable PDF text and compare the extracted vacancies to the source before publishing. Publishing replaces the visible issue. Form preparation closes at 00:00 Namibia time on its closing date. Supabase retires the issue 48 hours later.

The form import reads text on official forms that have been filled digitally. Review all imported values. Scans and handwritten forms can be entered manually.
