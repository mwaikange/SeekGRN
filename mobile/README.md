# SeekGRNJobs Android

The Expo SDK 58 app lives in `mobile/`. It uses the SeekGRN site, Supabase accounts and generated application forms. The Android application ID is `com.mwaikange.seekgrnjobs`. EAS uses the existing `seekgrnjobs` project ID `cafe6e4f-53f8-43e0-84cb-b1a9051a4e0c`.

## 1. Deploy and verify the website

The wrapper starts at `https://seek.paysme.site/?client=preview` or `https://seek.paysme.site/?client=play`. The root URL avoids a dependency on the `/mobile` rewrite. The wrapper waits for the current website’s Android bridge before showing the workspace.

Push the web changes to `main` on `mwaikange/SeekGRN`. The linked `seek-grn` Vercel project deploys from GitHub. Once the GitHub Vercel check passes, verify the live website in VS Code PowerShell:

```powershell
(Invoke-WebRequest -UseBasicParsing 'https://seek.paysme.site/?client=preview').Content -match 'seekgrn-app-bridge'
```

Continue when the command prints `True`. If it reports a 404 or DNS error, check that `seek.paysme.site` is assigned to the `seek-grn` project under **Vercel → Settings → Domains**. Add `https://seek.paysme.site/` to Supabase Auth's approved redirect URLs if you use OAuth or other link-based Auth flows on the website.

## 2. Scan in Expo Go

Open the `mobile` folder in the VS Code PowerShell terminal. On a fresh checkout or after a dependency change, run `npm ci` and wait for it to finish. With dependencies installed, start Expo Go:

```powershell
Set-Location 'C:\Users\clien\OneDrive\Documentos\ChatGPT\seekGRN\mobile'
npm run check
npm start
```

Scan the QR code with Expo Go for SDK 58 on Android. Use `npm start -- --tunnel` if Expo Go cannot reach Metro over your local network.

The npm scripts call the Expo CLI installed in `mobile/node_modules`. If Metro previously reported an error from `AppData\Roaming\npm\node_modules\expo`, exit Metro with `Ctrl+C` and run `npm start -- --clear` once. Scan the new QR code after Metro starts.

To scan against the local web source before deploying, start `npm run dev -- --host 0.0.0.0` in a separate terminal at the repository root. In the `mobile` terminal, set the network URL printed by Vite and start Metro. Keep the phone and computer on the same Wi-Fi network.

```powershell
$env:EXPO_PUBLIC_SEEKGRN_DEV_ORIGIN = 'http://192.168.1.100:5173' # Replace with Vite's Network URL.
npm start
```

Local Vite is suitable for checking the UI, authentication, and native picker integration. Test Vercel API routes, including PaySME and account removal, against the deployed site. To test the Play Store view in Expo Go, set `$env:EXPO_PUBLIC_SEEKGRN_PLAY = '1'` before starting Metro. Remove either variable to return to its default behavior.

## 3. Build and install the test APK

Stop Metro with `Ctrl+C`, then run these in `mobile/`:

```powershell
npx eas-cli@latest login
npx eas-cli@latest project:info
npx eas-cli@latest build --platform android --profile preview
```

Sign in to the Expo account that owns the linked project. The first build prompts for an Android keystore if the project has no existing credentials. Download the APK from the finished build and install it on the phone. Test email and SMS sign-in, Browse, PDF import, PNG/JPEG signature import, preparing and opening a form, saving to a selected folder, and sharing an attachment. The test APK retains PaySME's website payment request flow.

## 4. Build the Google Play AAB

After testing the APK:

```powershell
npx eas-cli@latest build --platform android --profile production
```

Upload the `.aab` to Google Play Console's internal testing track for the first Play release. The production profile targets Android API 36 through SDK 58 and increments `versionCode` through EAS. Verify the built bundle's 16 KB page size compatibility and declared permissions in Play Console, and complete the privacy, data safety, account deletion and app access sections with the actual app behavior. Provide a working reviewer account with email or mobile sign-in access. The test APK and Play build share an application ID. If Play signing prevents installation over the test APK, keep any locally saved work and remove the APK before installing from Play.

The Play build lets people use existing account access and check their allowance. PaySME checkout is available on the website and in the test APK. The sign-in screen shows Google and Apple based on the website's Supabase provider settings. With an enabled provider, the installed APK and Play build open the system browser and return to the app after sign-in. Add `com.mwaikange.seekgrnjobs://auth/callback` in Supabase under **Authentication → URL Configuration → Redirect URLs** before testing. The redirect is registered in the Android binary, so use a new APK or Play build for the first test. Expo Go can display the options. Complete at least one sign-in, preparation and native PDF export in the Play internal build before promoting it to production.

## 5. Publish OTA updates after the first builds

The first APK and AAB already contain the wrapper code from build time. The first release requires no OTA command. An optional preview OTA can be tested as soon as the preview APK is installed. A production OTA reaches matching installed Play builds on the `production` channel, including the internal testing track.

For a future compatible wrapper change, run the preview command from `mobile/`, then fully close and reopen the installed APK twice to check the change:

```powershell
npx eas-cli@latest update --platform android --channel preview --environment preview --message "Describe the change"
```

After verifying the update on the APK, run the production command when the same change is ready for the Play build:

```powershell
npx eas-cli@latest update --platform android --channel production --environment production --message "Describe the change"
```

Website changes go through Vercel. Wrapper JavaScript and bundled loader art can be published over the air for a matching fingerprint runtime. Changes to the launcher icon, native splash screen, permissions or native dependencies require a fresh binary. The app checks on launch and can apply a downloaded update on the next cold start.

## Android artwork

| Asset | File | Size |
| --- | --- | --- |
| App icon | `assets/icon.png` | 1024 × 1024 PNG |
| Adaptive and themed icon foreground | `assets/foreground.png` | 1024 × 1024 transparent PNG |
| Native splash logo | `assets/splash.png` | 512 × 512 transparent PNG |
| In-app loader artwork | `assets/loader-dunes.jpg` | 960 × 480 JPEG |
| Play Console listing icon | `assets/play-store-icon.png` | 512 × 512 PNG |

Check the native splash and launcher icon in the installed APK. Expo Go displays its own launch UI.

The wrapper domain change requires no PaySME SDK release. If PaySME’s central **Open SeekGRNJobs** button uses a manually registered destination, update the `SEEKGRN` entry using the [PaySME handoff](../PAYSME_APP_HANDOFF.md) after the new domain is live.
