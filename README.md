# SDG 4 apps

The SDG 4 website packaged as apps for Windows, Mac and Android.

- `web/` is the website (copied from the site's `dist` folder). Each app opens it offline.
- `main.js` opens the website in a desktop window (Windows and Mac).
- `capacitor.config.json` sets up the Android app.
- `.github/workflows/build.yml` builds all three files on GitHub and publishes them as a release.

## Updating the apps

1. Copy the new site files into `web/`.
2. Commit and push to `main`. GitHub builds the apps automatically (see the Actions tab).

## Download links

- Windows: `releases/latest/download/SDG4-Windows.exe`
- Mac: `releases/latest/download/SDG4-Mac.dmg`
- Android: `releases/latest/download/SDG4-Android.apk`

The apps are not signed. macOS and Windows show a warning the first time; see the download page on the website for how to open them.
