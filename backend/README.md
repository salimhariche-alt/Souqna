# Sougna API (backend)

Django + Django REST Framework backend. Uses SQLite for local development.

All commands below are for **Windows PowerShell**, run from inside the `backend` folder.

## First-time setup

```powershell
cd backend

# 1. Create the virtual environment (only once)
python -m venv .venv

# 2. Activate it (you'll see "(.venv)" at the start of your prompt)
.\.venv\Scripts\Activate.ps1

# 3. Install the dependencies
python -m pip install -r requirements.txt

# 4. Create your private settings file from the template
Copy-Item .env.example .env

# 5. Generate a secret key, then paste it into .env as DJANGO_SECRET_KEY='...'
python -c "from django.core.management.utils import get_random_secret_key as g; print(g())"

# 6. Create the database tables
python manage.py migrate

# 7. Create your admin login (asks for phone number, display name, password)
#    The phone must be an Algerian mobile number, e.g. 0555123456
python manage.py createsuperuser

# 8. (Optional) Load the main categories and 30 fake listings for testing
python manage.py seed_demo
```

`seed_demo` is safe to run more than once. To throw away the fake listings and
make fresh ones, run `python manage.py seed_demo --reset`. Fake sellers use phone
numbers `0550000001`-`0550000006` and cannot log in.

> `.env` holds your secret key and is ignored by git. Never commit it or share it.

> If step 2 says "running scripts is disabled on this system", run this once, then try again:
> `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`

## Start the server (every time)

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python manage.py runserver
```

Then open:

- http://127.0.0.1:8000/admin/ — Django admin (log in with your superuser)

### So a phone can connect (testing with Expo Go)

```powershell
python manage.py runserver 0.0.0.0:8000
```

`0.0.0.0` means "listen on the Wi-Fi network too", so a phone on the **same Wi-Fi**
can reach the laptop. While `DJANGO_DEBUG=True`, the laptop's current Wi-Fi address
is allowed automatically. Only do this on a network you trust (home), not on public
Wi-Fi: anyone on the same network could reach the server.

The first time, Windows Firewall may ask whether Python can use the network —
allow it on **Private networks**.

## API (all under /api/)

Open these in a browser while the server runs. To try the logged-in ones, log in
first at http://127.0.0.1:8000/api-auth/login/ (phone number + password).

| Address | What it does | Who |
|---|---|---|
| `POST /api/auth/signup/` | Sign up: `phone` and/or `email`, `password` (8+ chars), `display_name`, `wilaya`, optional `preferred_language`. Returns tokens | Anyone |
| `POST /api/auth/login/` | Log in: `phone_or_email` + `password`. Returns `access` + `refresh` tokens | Anyone |
| `POST /api/auth/refresh/` | Send `refresh`, get a new `access` token | Anyone |
| `GET` / `PATCH /api/auth/me/` | See / edit my display name, wilaya, language | Logged in |
| `GET /api/categories/` | All categories in ar / fr / en | Anyone |
| `GET /api/listings/` | Active listings, newest first, 20 per page | Anyone |
| `GET /api/listings/?category=1&wilaya=16&min_price=1000&max_price=9000&size=M&condition=good&search=nike` | Filters and search (use any combination) | Anyone |
| `GET /api/listings/{id}/` | One listing with photos and seller name | Anyone |
| `POST /api/listings/` | Create a listing | Logged in |
| `PATCH /api/listings/{id}/` | Edit, or set `status` to `reserved` / `sold` | Seller only |
| `POST /api/listings/{id}/photos/` | Upload one photo (field `image`, max 8, 10 MB) | Seller only |
| `POST` / `DELETE /api/listings/{id}/favorite/` | Add / remove from my favorites | Logged in |
| `GET /api/favorites/` | My favorites | Logged in |
| `GET /api/conversations/` | My conversations, newest activity first, with unread counts | Logged in |
| `POST /api/conversations/` | Ask a seller about a listing: `listing` + `text` (reuses an existing conversation) | Logged in, not the seller |
| `GET /api/conversations/{id}/` | All messages, oldest first; marks the other person's as read | Buyer or seller |
| `POST /api/conversations/{id}/messages/` | Send a message: `text` (1 to 1,000 characters) | Buyer or seller |

**Using a token (mobile app):** send the access token in every request header:
`Authorization: Bearer <access token>`. Access tokens last 30 minutes; refresh
tokens last 30 days. Sign-up and log-in allow 10 attempts per minute.

Run the automated tests with `python manage.py test`.

Stop the server with `Ctrl+C`. Leave the virtual environment with `deactivate`.

## After pulling new code

```powershell
python -m pip install -r requirements.txt   # if requirements.txt changed
python manage.py migrate                    # if there are new migrations
```
