# Phone apps (Capacitor 8): Android and iOS

The same React client as the web app, in native Android and iOS shells (`android/`, `ios/`). The phone layout
(bottom navigation, safe areas) comes from the client's CSS. Phones sync whenever they reach the server, on the
shop Wi-Fi (LAN address) or anywhere through the Cloudflare Tunnel (D-88).

- **Android:** GitHub Actions → workflow **Apps** → job `android` → artifact `android-apk`. Install the APK on any
  phone (allow "install unknown apps"). A Play Store release needs a signing key (to add later as repository secrets).
- **iOS:** the `ios` job builds for the simulator to prove it compiles. Installing on iPhones needs an
  **Apple Developer account** ($99/year): then add the signing certificate and profile as repository secrets and the
  job can produce an `.ipa` for TestFlight.
- **After changing the client:** `npm run sync -w @jc/mobile` copies the new build into both native projects.
- **Server addresses:** login screen → «عنوان الخادم», or baked in with the repository variable `SERVER_URLS`.
- **LAN over http:** Android allows cleartext (`usesCleartextTraffic`), iOS allows local networking
  (`NSAllowsLocalNetworking`). The tunnel is https.
- **Icons:** `assets/icon.png` (1024×1024), already copied into both projects.
- Next (Phase 7): phone-first screens for the work the phone is used for (car lookup, photos, status), camera
  for intake photos, push notifications.
