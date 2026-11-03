# SDG 4 apps

The SDG 4 website packaged as apps for Windows, Mac, Android and iPad/iPhone.

- `web/` is the website (copied from the site's `dist` folder). Each app opens it offline.
- `main.js` opens the website in a desktop window (Windows and Mac).
- `capacitor.config.json` sets up the Android and iOS apps.
- `.github/workflows/build.yml` builds all five files on GitHub and publishes them as a release. A push to `main` publishes the release. Pushes to other branches only build the files, so you can check them in the Actions tab.

## Updating the apps

1. Copy the new site files into `web/`.
2. Commit and push to `main`. GitHub builds the apps automatically (see the Actions tab).

## Download links

- Windows: `releases/latest/download/SDG4-Windows.exe`
- Mac: `releases/latest/download/SDG4-Mac.dmg`
- Android: `releases/latest/download/SDG4-Android.apk`
- iPad and iPhone (iOS 15 and later): `releases/latest/download/SDG4-iOS.ipa`
- Older iPads (iOS 12 to 14): `releases/latest/download/SDG4-iOS-older.ipa`

The apps are not signed. macOS and Windows show a warning the first time; see the download page on the website for how to open them.

The iPad files are not signed, so iOS will not install them by itself. Sign it with a tool such as Sideloadly and a free Apple ID (the app stops opening after 7 days), or with an Apple Developer account for a permanent install.
