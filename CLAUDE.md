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
  **Tested on the live server** (Step 3.4): builds and runs on the 1 GB Droplet (~160 MB for
  the 3 containers), PostgreSQL data in `/var/lib/postgresql/18/docker`, both Let's Encrypt
  certificates, API, admin CSS, photos, www and http redirects. Not yet tried with Docker
  Desktop on the laptop (not installed) and the test suite has not been run on PostgreSQL.
- Web app + updates (Step 3.5): **`deploy.ps1`** (laptop, PowerShell 5.1, plain ASCII only)
  builds the web app locally, runs `deploy/server-update.sh` (backup to `~/backups`, rebuild +
  restart backend and Caddy, migrations) and `deploy/install-web.sh` (upload to
  `web/releases/<date>`, switch `web/current`) on the server, then checks the live site.
  `Caddyfile`: `/api/`, `/admin/`, `/api-auth/` -> Django; `/media/`, `/static/` -> files;
  everything else -> the web app (`try_files {path} /index.html`). See `DEPLOY.md` Part C.

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
- **Beta mode (Step 4.1)** - `DJANGO_BETA_MODE` in `.env` (`settings.BETA_MODE`, default off;
  the app reads `GET /api/auth/config/` -> `{"beta_mode": ...}` via `useAppConfig()`):
  sign up needs an **invite code** (`accounts.InviteCode`: name, code, max uses, expiry,
  active; `User.invite_code`, PROTECT) and a phone; no SMS (`send-code` -> 403
  `beta_manual_verification`), the app shows "Your account will be verified shortly" and the
  admin clicks **Verify** in Users (filter "Waiting for verification", or the bulk action);
  "Beta" label (Home header, Profile). Off = SMS codes as before. How-to: `DEPLOY.md` Part D.
- **Send feedback** (Profile tab, logged in): message + optional screenshot ->
  `POST /api/feedback/` (app `feedback`, 20/day, screenshot re-saved max 1600 px without
  hidden data, erased with the account); admin "Feedback from testers".

**Phase 3 - putting it online (in progress).** Done: 3.1 Docker Compose setup; 3.2 server;
3.3 domain; 3.4 rename to Sougna + first deploy - the backend runs at https://sougnadz.com
(HTTPS, `DEBUG=False`, PostgreSQL, uploads in a Docker volume, database cache shared by the
gunicorn workers); 3.5 web version of the app at https://sougnadz.com + `deploy.ps1`.
**Phase 4 - testers:** 4.1 beta mode (invite codes, admin verification, "Beta" label) and
"Send feedback" - beta mode is ON on the server.
Still to do: build the phone app with EAS for Android/iOS, a real SMS provider (`DJANGO_SMS_BACKEND`), email for urgent moderation alerts
(`DJANGO_MODERATION_ALERT_BACKEND`), automatic off-server backups, HSTS
(`DJANGO_HSTS_SECONDS`), possibly private serving of voice messages/avatars (now random,
unguessable names under `/media/`), Redis if the database cache gets too slow, removing the
fake listings before launch, store listings, a privacy policy and terms (incl. how long
moderation evidence is kept - ask a lawyer about Algerian law), and choosing the license.

## Server

- **Step 3.2 done:** DigitalOcean Droplet, Ubuntu 24.04 LTS, 1 GB memory, San Francisco region.
- IP address: `104.248.191.120`. Log in from the laptop (PowerShell): **`ssh sougna@104.248.191.120`**
  (root login is turned off since Step 3.4).
- Login uses the laptop's SSH key (ed25519, `C:\Users\salim\.ssh\id_ed25519`, no passphrase),
  not a password. Only the public key (`id_ed25519.pub`) was given to DigitalOcean. Never show,
  copy or commit the private key. Lost key: DigitalOcean website -> Droplet -> Access -> Console.
- **Step 3.3 done:** domain `sougnadz.com` (bought on Namecheap, Namecheap's DNS). Two A records,
  `@` and `www`, point to `104.248.191.120`: `sougnadz.com` and `www.sougnadz.com` both reach
  the server (checked on Google 8.8.8.8 and Cloudflare 1.1.1.1 DNS).
  Check again in PowerShell: `Resolve-DnsName sougnadz.com -Server 8.8.8.8`.
- **Step 3.4 done (17 Nov 2026): first deploy** - every command is in `DEPLOY.md` Part B.
  - User `sougna` (sudo without password, no password at all, laptop key). SSH: password and
    root login off (`/etc/ssh/sshd_config.d/00-sougna-hardening.conf`; `00-` because
    `50-cloud-init.conf` says `PasswordAuthentication yes` and the first value wins).
  - Firewall `ufw`: only 22/tcp, 80/tcp, 443/tcp+udp. Swap 2 GB (`swappiness=10`).
    Automatic security updates (`unattended-upgrades`); no automatic restart - check
    `/var/run/reboot-required`.
  - Docker from Docker's apt repository (Docker 29.10, Compose 5.7); `sougna` is in the
    `docker` group.
  - Code in `/home/sougna/sougna` (branch `main`), cloned with a **read-only deploy key**
    (`~/.ssh/github_deploy` on the server, GitHub -> Settings -> Deploy keys
    "sougna-server (DigitalOcean)"; public copy `C:\Users\salim\deploy_key.pub`).
  - `/home/sougna/sougna/.env`: random `DJANGO_SECRET_KEY` and `POSTGRES_PASSWORD` made on the
    server (chmod 600, never printed, not in Git). SMS codes and alerts still printed in the logs.
  - Running: https://sougnadz.com (Let's Encrypt, www and http redirect to it). Data: 5 categories,
    **30 fake listings from 6 demo sellers (remove before launch)**, 1 admin (created by the user;
    the password is not known to Claude).
- **Step 3.5 done: web app** at https://sougnadz.com (built on the laptop, files in
  `~/sougna/web/releases/<date>`, `web/current` = live version, 3 kept; not in Git).
- **Update the live site (backend + web app): on the laptop, on `main`, everything pushed:**
  `powershell -ExecutionPolicy Bypass -File .\deploy.ps1` -> ends with `DEPLOY OK` or
  `DEPLOY FAILED during: <step>`. Options `-SkipWeb`, `-SkipBackend`. Database backups before
  each update in `~/backups/db-<date>.sql.gz` on the server (10 kept).
- Everyday (on the server, in `~/sougna`): logs with SMS codes/alerts
  `docker compose logs -f --tail 50 backend`; status `docker compose ps`; restart
  `docker compose restart backend`. Never `docker compose down -v`.
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
python manage.py test            # all backend tests (346 after Step 4.1)
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
