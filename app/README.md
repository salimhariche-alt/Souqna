# Sougna app (Expo)

The mobile and web app for Sougna, built with Expo (SDK 58), TypeScript and Expo Router.

All commands are for **Windows PowerShell**, run from inside the `app` folder.

## First-time setup

```powershell
cd app
npm install
```

## Start the app (every time)

Start the backend first (see `backend/README.md`), then:

```powershell
cd app
npx expo start
```

- **Phone:** install **Expo Go** from the App Store / Google Play, make sure the phone
  is on the **same Wi-Fi** as the laptop, then scan the QR code shown in the terminal
  (Android: scan from Expo Go; iPhone: scan with the Camera app).
- **Web browser:** press `w` in the terminal, or open http://localhost:8081

Stop with `Ctrl+C`.

## Where things are

| Path | What it is |
|---|---|
| `src/config.ts` | The backend address (the only place to change it) |
| `src/app/(tabs)/` | The 5 tab screens: Home, Search, Sell, Messages, Profile |
| `src/i18n/locales/` | Translations: `fr.ts` (default), `ar.ts`, `en.ts` |
| `src/i18n/language-provider.tsx` | Remembers the language and flips the layout right-to-left for Arabic |
| `src/api/` | Code that talks to the backend |

## Checks

```powershell
npm run typecheck      # TypeScript
npx expo-doctor        # dependency and config check
```

Add packages with `npx expo install <package>` (not `npm install`), so versions
match the Expo SDK.
