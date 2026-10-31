# Windows app (Tauri 2)

The same React client as the web app, in a native window (WebView2, built into Windows 11), ~10 MB installer.

- **Build:** GitHub Actions → workflow **Apps** → job `windows` → artifact `windows-installer` (`Jeep City_x.y.z_x64-setup.exe`).
  A version tag (`git tag v0.1.0 && git push --tags`) also attaches it to a GitHub Release.
- **Server addresses:** login screen → «عنوان الخادم»: the shop address (`http://192.168.1.10/api`) is tried first,
  the tunnel address (`https://jc.<domain>/api`) when outside or when the LAN does not answer within 3 s (D-88).
  Defaults can be baked in with the repository variable `SERVER_URLS`.
- **Offline:** the app keeps its local copy and outbox (Phase 4) exactly like the browser version.
- **Local build** (optional, needs Rust + Visual Studio Build Tools): `npm run build -w @jc/desktop`.
- **Icons:** regenerate from `app-icon.png` with `npm run icons -w @jc/desktop`.
- Not done yet: code signing (Windows SmartScreen warns "unknown publisher" until a certificate is bought), auto-update.
