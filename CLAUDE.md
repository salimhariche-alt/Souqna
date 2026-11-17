# Sougna

A second-hand marketplace for Algeria. Name: **Sougna** (French/English), **سوقنا** (Arabic).
Live address: **https://sougnadz.com** (www.sougnadz.com redirects there).

Renamed from "Souqna" in Step 3.4. On purpose these still say `souqna` (invisible to users,
renaming them would break things): the Django folder `backend/souqna_api/`, the phone storage
labels (`souqna.access`, `souqna.language`, ... - renaming logs users out), and the GitHub
repository name (`salimhariche-alt/Souqna`).

Monorepo:

- `backend/` - Django 6.1 + Django REST Framework API (SQLite on the laptop, PostgreSQL in
  Docker when `POSTGRES_HOST` is set). See `backend/README.md`.
- `app/` - Expo SDK 58 app (TypeScript, Expo Router, routes in `app/src/app/`). See `app/README.md`.
- Server (Step 3.1): `docker-compose.yml` (db = PostgreSQL 18, backend = gunicorn, caddy = HTTPS),
  `Caddyfile`, `.env.example` (copied to the root `.env`, never committed), `backend/Dockerfile`,
  `backend/docker-entrypoint.sh` (migrate, createcachetable, collectstatic). Every step in
  `DEPLOY.md`. Two different env files: `backend/.env` = laptop `runserver`; root `.env` = Docker.
  **Not tested with Docker yet** (committed at the user's request without Docker Desktop
  installed): the first `docker compose up -d --build` (laptop or server) must be checked
  carefully - images `python:3.15-slim`, `postgres:18-alpine` (volume at `/var/lib/postgresql`),
  `caddy:2-alpine`; then the API, admin CSS, a photo, the www redirect and `manage.py test`.

## Progress

**Phase 1 (backend) and Phase 2 (app) are DONE** - all merged into `main`.

- **Phase 1 - Backend:** 1.1 Django project + admin; 1.2 models (`User` with phone/email login,
  `Category` ar/fr/en, `Listing`, `ListingPhoto` max 8, `Favorite`, `Conversation`, `Message`,
  58 wilayas, `seed_demo`); 1.3 listings/favourites/categories API; 1.4 JWT auth
  (`/api/auth/`: signup, login, refresh, me); 1.5 messaging (`/api/conversations/`).
- **Phase 2 - App:** 2.1 Expo app, 5 tabs, fr/ar/en with right-to-left Arabic;
  2.2 #1 Log in / Sign up; #2 Home feed; #3 Listing details; #4 Search/Browse; #5 Sell + Edit
  with photo upload; #6 Messages + chat; #6b voice messages; #7 Profile, public seller profile,
  account deletion; 2.3a design system (brand colour Vert Atlas `#17784A`, IBM Plex Sans Arabic);
  2.3b every screen restyled.
- **Safety steps:** 1 SMS phone verification + trust badges; 2 automatic anti-scam checks
  (daily limits, suspicious price/photo/words, device IDs, admin Needs review, suspend/ban);
  3 report, block, message warnings, "Buy safely" tips; 4 content moderation (insults,
  harassment, sexual content, threats, extremism; strikes; moderation queue).

### What the app can do now

- **Accounts:** sign up / log in with phone or email; verify the phone by SMS code (6 digits);
  profile photo, name and wilaya; delete the account (personal data erased, evidence kept).
- **Browse:** Home feed with category chips; Browse with search (items and members), large
  category tiles, filters (category, wilaya, price, size, condition); listing details with
  photos, seller trust info (phone verified, member since, items sold); favourites.
- **Sell:** up to 8 photos (camera/gallery, resized, location data removed), title,
  description, category, size, brand, condition, price in DA, wilaya; edit, reserve, mark as
  sold, delete; "My listings" (Active / Under review / Reserved / Sold).
- **Chat:** conversations per listing, unread dot on the Inbox tab, messages every 5 s,
  voice messages (hold to record, max 60 s), "Buy safely" tips before writing to a new seller.
- **Safety:** daily limits for new accounts; listings with a too-low price, copied photos,
  phone numbers/links or payment-in-advance words go to "Needs review"; warnings under
  suspicious messages; report / block users, listings and messages; insults ask "send anyway?",
  harassment/sexual messages are hidden until tapped, threats/extremism are not delivered and
  alert the admin; strikes (3 = 7 days without messages, 4+ = suspended, never auto-ban).
- **Admin** (`/admin/`): Needs review, Reports, Moderation queue (urgent first), content word
  lists with a "Test a text" page, devices, blocked phones, moderation log, users (suspend,
  reactivate, ban, remove profile photo, strikes, suspicious messages).
- **Everywhere:** French (default), Arabic (right-to-left) and English; light and dark mode;
  design system in `app/src/theme/` (colours, sizes, font) and `app/src/ui/` (building blocks).

**Next: Phase 3 - putting it online.** Main pieces: a server and domain with HTTPS,
`DEBUG=False`, PostgreSQL instead of SQLite, file storage for photos/voice (voice messages and
avatars should not be publicly guessable/served), a real SMS provider (`DJANGO_SMS_BACKEND`),
email for urgent moderation alerts (`DJANGO_MODERATION_ALERT_BACKEND`), a shared cache (Redis)
for login limits and throttling, backups, building the app with EAS for Android/iOS, store
listings, a privacy policy and terms (incl. how long moderation evidence is kept - ask a
lawyer about Algerian law), and choosing the project's license.

## Server

- **Step 3.2 done:** DigitalOcean Droplet, Ubuntu 24.04 LTS, 1 GB memory, San Francisco region.
- IP address: `104.248.191.120`. Log in from the laptop (PowerShell): `ssh root@104.248.191.120`.
- Login uses the laptop's SSH key (ed25519, `C:\Users\salim\.ssh\id_ed25519`), not a password.
  Only the public key (`id_ed25519.pub`) was given to DigitalOcean. Never show, copy or commit
  the private key.
- **Step 3.3 done:** domain `sougnadz.com` (bought on Namecheap, Namecheap's DNS). Two A records,
  `@` and `www`, point to `104.248.191.120`: `sougnadz.com` and `www.sougnadz.com` both reach
  the server (checked on Google 8.8.8.8 and Cloudflare 1.1.1.1 DNS).
  Check again in PowerShell: `Resolve-DnsName sougnadz.com -Server 8.8.8.8`.
- Not set up yet on the server: a normal (non-root) user, firewall, swap, Docker, the app
  and HTTPS (Caddy will get the certificate for the domain by itself).
- Never write passwords, private keys or the server's `.env` in this file or anywhere in the
  repository.

## Start the servers again (Windows PowerShell)

Open two terminals in VS Code (**Terminal -> New Terminal**).

**Terminal 1 - Django backend**

```powershell
cd C:\Users\salim\myapp\backend
.\.venv\Scripts\Activate.ps1
python manage.py runserver 0.0.0.0:8000
```

- `0.0.0.0` lets a phone on the same Wi-Fi connect. Only use it on a trusted network (home).
  On public Wi-Fi use `python manage.py runserver` instead (this laptop only).
- Admin: http://127.0.0.1:8000/admin/ - API: http://127.0.0.1:8000/api/
- SMS codes (phone verification) and urgent moderation alerts are printed in this terminal.

**Terminal 2 - Expo app**

```powershell
cd C:\Users\salim\myapp\app
npx expo start --lan --port 8084
```

- Add `--clear` after adding, moving or removing screen files or packages.
- Phone: open **Expo Go** (SDK 58), same Wi-Fi as the laptop, scan the QR code in the terminal
  (or "Enter URL manually": `exp://<laptop Wi-Fi address>:8084`).
- Web browser: press `w`, or open http://localhost:8084 (voice messages can't be recorded in a
  browser - they record WebM, the server only accepts AAC/M4A - but they can be played).
- Stop either server with `Ctrl+C`.

## Checks before committing

```powershell
# backend (venv active)
python manage.py test            # all backend tests (310 at the end of Phase 2)
python manage.py makemigrations --check --dry-run

# app
npm run typecheck
npx expo-doctor
npx expo export --platform android --platform web --output-dir <temp folder>   # build check
```

## Working agreements

- The user is a beginner on Windows: explain each step in simple words before doing it.
- One branch per step (e.g. `step-2.2-...`), push, the user merges the pull request on GitHub,
  then switch back to `main`, pull, and delete the finished branch when asked.
- Commit / push only when the user asks. Write commit messages to a temporary file and use
  `git commit -F <file>`: Windows PowerShell 5.1 breaks double quotes inside `git commit -m`.
- PowerShell 5.1 shows Arabic/accented JSON as garbled text; check API text with Python instead.
- After moving or renaming a screen file in `app/src/app/`, restart Expo with `--clear`.
  Otherwise the old route survives, two screens claim the same address, and tapping a link
  silently does nothing ("Found conflicting screens with the same pattern" in the log).
- Run only one `npx expo start` at a time; several servers on different ports confuse Expo Go.
- Add app packages with `npx expo install <package>` (keeps versions matching SDK 58).
  Expo changes often: read `app/AGENTS.md` and check the SDK 58 docs instead of relying on memory.
- File uploads: Expo SDK 58's `fetch` rejects React Native's `{ uri, name, type }` FormData
  parts. Use a part with `bytes()` from `expo-file-system`'s `File` (see `uploadListingPhoto`).
- RTL: don't use `I18nManager.forceRTL` + reload (doesn't work in Expo Go on SDK 58). The app sets
  `direction: 'rtl'` on its root view plus Expo Router's `LocaleProvider`
  (`app/src/i18n/language-provider.tsx`). Modals must set `direction` themselves.
- Design: new code uses `useTokens()` from `@/theme` and the building blocks in `@/ui`; no colours
  written by hand in screens. The brand colour is one line: `CHOSEN_BRAND` in
  `app/src/theme/tokens.ts`. Check text contrast (WCAG AA 4.5:1) in light AND dark mode.
- All user-facing text exists in `fr` (source of the types), `ar` and `en`
  (`app/src/i18n/locales/`).
- Never commit `backend/.env`, `backend/db.sqlite3`, `backend/media/`, `node_modules/`,
  `docs/inspiration/` (screenshots of other apps). The repository is public: no passwords or
  personal phone numbers in committed files.
- `app/LICENSE` (Expo's template MIT license) is intentionally not committed; choosing the
  project's license is the user's decision.

## Local test data

- `python manage.py seed_demo` - 5 categories + 30 demo listings from 6 demo sellers
  (`0550000001`-`0550000006`, cannot log in). `--reset` recreates the listings.
- Test accounts exist in the local database for trying messaging (e.g. "Seller Test"
  `0661000001`, "Buyer Test" `0771000002`). Their password is not stored in the repository.
