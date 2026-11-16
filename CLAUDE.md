# Souqna

A second-hand marketplace for Algeria. Monorepo:

- `backend/` - Django 6.1 + Django REST Framework API (SQLite for now). See `backend/README.md`.
- `app/` - Expo SDK 58 app (TypeScript, Expo Router, routes in `app/src/app/`). See `app/README.md`.

## Progress

**Done (all merged into `main`):**

- **Phase 1 - Backend**
  - 1.1 Django project `souqna_api`, DRF, admin, `.venv`, secret key in `backend/.env`
  - 1.2 Database models + admin: custom `User` (phone/email login), `Category` (ar/fr/en),
    `Listing`, `ListingPhoto` (max 8), `Favorite`, `Conversation`, `Message`;
    58 wilayas in `souqna_api/wilayas.py`; `python manage.py seed_demo` loads demo data
  - 1.3 API under `/api/`: listings (filters, search, 20 per page), details, create/edit,
    reserved/sold, photo upload, favorites, categories
  - 1.4 Auth under `/api/auth/` with JWT (simplejwt): `signup/`, `login/` (phone or email),
    `refresh/`, `me/`. Access token 30 min, refresh 30 days, header `Authorization: Bearer <access>`
  - 1.5 Messaging under `/api/conversations/`: start, list (unread counts), open (marks read), send
- **Phase 2 - App**
  - 2.1 Expo app: 5 tabs (Home, Search, Sell, Messages, Profile), translations fr (default) /
    ar / en with a language switcher, Arabic flips the layout right-to-left, backend address in
    `app/src/config.ts`, Home shows the active listings count from the API.
    Backend: `ALLOWED_HOSTS` + CORS (django-cors-headers) for the phone and web app.

**Next: Phase 2, Step 2.2 - start with the Log in / Sign up screens** (using `/api/auth/signup/`,
`/api/auth/login/`, `/api/auth/refresh/`, `/api/auth/me/`).

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

**Terminal 2 - Expo app**

```powershell
cd C:\Users\salim\myapp\app
npx expo start
```

- Phone: open **Expo Go** (SDK 58), same Wi-Fi as the laptop, scan the QR code in the terminal
  (or "Enter URL manually": `exp://<laptop Wi-Fi address>:8081`).
- Web browser: press `w`, or open http://localhost:8081
- Stop either server with `Ctrl+C`.

## Checks before committing

```powershell
# backend (venv active)
python manage.py test            # all backend tests (111 at the end of Step 2.1)
python manage.py makemigrations --check --dry-run

# app
npm run typecheck
npx expo-doctor
```

## Working agreements

- The user is a beginner on Windows: explain each step in simple words before doing it.
- One branch per step (e.g. `step-2.2-...`), push, the user merges the pull request on GitHub,
  then switch back to `main`, pull, and delete the finished branch when asked.
- Write commit messages to a temporary file and use `git commit -F <file>`: Windows
  PowerShell 5.1 breaks double quotes inside `git commit -m`.
- PowerShell 5.1 shows Arabic/accented JSON as garbled text; check API text with Python instead.
- After moving or renaming a screen file in `app/src/app/`, restart Expo with `npx expo start -c`
  (clears the cache). Otherwise the old route survives, two screens claim the same address, and
  tapping a link silently does nothing ("Found conflicting screens with the same pattern" in the log).
- Run only one `npx expo start` at a time; several servers end up on 8081/8082/8083 and confuse Expo Go.
- Add app packages with `npx expo install <package>` (keeps versions matching SDK 58).
  Expo changes often: read `app/AGENTS.md` and check the SDK 58 docs instead of relying on memory.
- RTL: don't use `I18nManager.forceRTL` + reload (doesn't work in Expo Go on SDK 58). The app sets
  `direction: 'rtl'` on its root view plus Expo Router's `LocaleProvider`
  (`app/src/i18n/language-provider.tsx`).
- Never commit `backend/.env`, `backend/db.sqlite3`, `backend/media/`, `node_modules/`.
  The repository is public: no passwords or personal phone numbers in committed files.
- `app/LICENSE` (Expo's template MIT license) is intentionally not committed; choosing the
  project's license is the user's decision.

## Local test data

- `python manage.py seed_demo` - 5 categories + 30 demo listings from 6 demo sellers
  (`0550000001`-`0550000006`, cannot log in). `--reset` recreates the listings.
- Two test accounts exist in the local database for trying messaging: "Seller Test"
  (`0661000001`, owns listing "Sac Zara (test)") and "Buyer Test" (`0771000002`).
  Their password is not stored in the repository.
