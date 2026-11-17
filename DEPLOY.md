# Putting Sougna online (Docker)

This guide runs the Sougna **backend** (API + admin) with Docker Compose:

```
 phone app / browser
        |  https (port 443)
        v
   +---------+      +------------------------------+      +--------------+
   |  caddy  | ---> | backend (Django + gunicorn)  | ---> |  db          |
   +---------+      +------------------------------+      | (PostgreSQL) |
     |   also serves /media/ (photos, voice) and /static/ (admin CSS)  +--------------+
```

- **caddy** - the web server. Gets and renews the HTTPS certificate by itself.
- **backend** - Django, run by gunicorn (2 processes, fits in 1 GB of memory).
- **db** - PostgreSQL, the database.

What is kept when containers restart or are rebuilt (Docker **volumes**):

| Volume                 | What is inside                                 |
| ---------------------- | ---------------------------------------------- |
| `sougna_postgres_data` | the database (users, listings, messages...)    |
| `sougna_media`         | uploaded photos, profile photos, voice messages |
| `sougna_caddy_data`    | the HTTPS certificates                         |
| `sougna_static`        | the admin's CSS (re-created at every start)    |

The files involved: `docker-compose.yml`, `Caddyfile`, `.env.example` (in the main folder),
`backend/Dockerfile`, `backend/docker-entrypoint.sh`.

All passwords and keys live in a file named **`.env`** next to `docker-compose.yml`.
It is **never** put in Git. `.env.example` explains every setting.

> SMS codes and urgent moderation alerts are still in **development mode**: they are only
> printed in the logs (`docker compose logs -f backend`). A real SMS provider and email
> alerts come later in Phase 3.

---

## Part A - Try it on your Windows laptop (Docker Desktop)

### A1. Install Docker Desktop (once)

1. Open https://www.docker.com/products/docker-desktop/ and download **Docker Desktop for
   Windows** (the "AMD64" version for most laptops).
2. Run the installer. Leave **"Use WSL 2 instead of Hyper-V"** ticked. WSL 2 is a small Linux
   inside Windows that Docker needs. The installer sets it up.
3. Restart the computer when asked.
4. Open **Docker Desktop** from the Start menu. Accept the terms. You can skip signing in.
   Wait until the bottom-left corner says **"Engine running"** (green).
   - If it asks to update WSL, open PowerShell and run `wsl --update`, then restart Docker Desktop.
5. Check it works. Open a **new** terminal in VS Code (**Terminal -> New Terminal**):
   ```powershell
   docker --version
   docker compose version
   ```
   Both should print a version number.

Docker Desktop must be **running** (whale icon in the taskbar) every time you use Docker.

### A2. Create the `.env` file

In the VS Code terminal:

```powershell
cd C:\Users\salim\myapp
copy .env.example .env
```

Make two random values. Run this command **twice** and copy each result:

```powershell
backend\.venv\Scripts\python.exe -c "import secrets; print(secrets.token_urlsafe(50))"
```

Open `.env` in VS Code. Paste one value into `DJANGO_SECRET_KEY='...'` and the other into
`POSTGRES_PASSWORD='...'`. Keep the single quotes. For the laptop test, change
`SITE_ADDRESS='localhost'` and `DJANGO_ALLOWED_HOSTS='localhost'` (the file is prepared for
the live server, `sougnadz.com`). Save.

### A3. Start everything

Stop the development Django server first if it runs (`Ctrl+C` in its terminal). Then:

```powershell
cd C:\Users\salim\myapp
docker compose up -d --build
```

- `--build` builds the backend image (the first time it downloads Python, PostgreSQL and
  Caddy, which takes a few minutes).
- `-d` runs everything in the background.

Check that the 3 parts are running:

```powershell
docker compose ps
```

You should see `sougna-db-1` (healthy), `sougna-backend-1` and `sougna-caddy-1`, all "Up".

### A4. Create the admin user and load the test data

```powershell
docker compose exec backend python manage.py createsuperuser
```

It asks for a phone number, a display name and a password (typing the password shows nothing,
that's normal). This database is new and empty, so your laptop's test accounts are **not**
in it.

Load the demo categories and 30 demo listings:

```powershell
docker compose exec backend python manage.py seed_demo
```

### A5. Check it in the browser

| Open this                                | You should see                                   |
| ---------------------------------------- | ------------------------------------------------ |
| https://localhost/api/                   | the API home page listing all endpoints         |
| https://localhost/api/categories/        | the 5 demo categories                            |
| https://localhost/api/listings/          | the demo listings (with photo addresses)         |
| https://localhost/admin/                 | the admin login page **with its normal design**  |

- The first time, the browser warns **"Your connection is not private"**. On your laptop Caddy
  makes its own certificate for `localhost`, which browsers don't know. Click
  **Advanced -> Continue to localhost (unsafe)**. On the real server with a real domain there
  is no warning.
- Log in to the admin with the phone number and password from A4.
- Open a photo address from `/api/listings/` (e.g. `https://localhost/media/listings/...jpg`).
  The picture should show.
- http://localhost/ (without the "s") jumps to https automatically.

### A6. Useful commands

```powershell
docker compose logs -f backend      # Django's logs: SMS codes, alerts, errors (Ctrl+C to leave)
docker compose logs -f caddy        # web server / certificate logs
docker compose restart backend      # restart Django
docker compose down                 # stop everything (data is KEPT)
docker compose up -d                # start again
docker compose exec backend python manage.py test   # run the tests on PostgreSQL
```

To start from an **empty** database on the laptop (deletes the Docker data, not your
`backend\db.sqlite3`): `docker compose down -v`. **Never run `down -v` on the live server.**

The app on your phone (Expo Go) still talks to the development server
(`python manage.py runserver 0.0.0.0:8000`). Pointing the app to the live server comes later
in Phase 3. Run `docker compose down` before starting the development server again if you like.
The two don't share a database.

---

## Part B - The live server (Ubuntu, 1 GB of memory)

### B1. What you need

- A **VPS** (virtual server) with **Ubuntu 24.04 LTS** (or newer LTS), 1 GB memory, ~25 GB
  disk. Any provider works (e.g. Hetzner, DigitalOcean, OVH, Contabo). Write down its
  **IP address** and the **root password** or SSH key you chose.
- A **domain name**. Sougna uses **`sougnadz.com`** (bought on Namecheap). In the domain's DNS
  settings add two **A records** pointing to the server's IP address: `@` (for
  `sougnadz.com`) and `www` (for `www.sougnadz.com`). It can take from a few minutes to a
  few hours to work. Check in PowerShell: `Resolve-DnsName sougnadz.com -Server 8.8.8.8`.
  (Done: both point to the DigitalOcean server, see CLAUDE.md "Server".)

### B2. Connect to the server

Windows has `ssh` built in. In PowerShell:

```powershell
ssh root@104.248.191.120
```

(`104.248.191.120` is Sougna's DigitalOcean server; `YOUR.SERVER.IP` below means the same.)
Type `yes` the first time. With an SSH key there is no server password to type. You are now typing commands **on the server**.

### B3. Prepare the server (once)

Update Ubuntu:

```bash
apt update && apt upgrade -y
```

Create a normal user (don't work as root every day) and give it admin rights:

```bash
adduser sougna
usermod -aG sudo sougna
```

Firewall: only allow SSH, http and https:

```bash
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw enable
```

**Swap** (extra memory on the disk). Important with only 1 GB, so the server doesn't run
out of memory while building:

```bash
fallocate -l 1G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

Install Docker (official script from Docker):

```bash
curl -fsSL https://get.docker.com | sh
usermod -aG docker sougna
```

Log out (`exit`) and log in again as the new user: `ssh sougna@YOUR.SERVER.IP`.
Check: `docker compose version`.

### B4. Get the code

```bash
git clone https://github.com/salimhariche-alt/Souqna.git sougna
cd sougna
```

### B5. Create the `.env` file

```bash
cp .env.example .env
python3 -c "import secrets; print(secrets.token_urlsafe(50))"   # run twice, copy each
nano .env
```

In `nano`, check or change:

- `SITE_ADDRESS='sougnadz.com'` (no `https://`, no `www.`: Caddy adds `www.sougnadz.com` itself)
- `DJANGO_ALLOWED_HOSTS='sougnadz.com,www.sougnadz.com'`
- `DJANGO_SECRET_KEY='...'` and `POSTGRES_PASSWORD='...'` -> the two random values
- `DJANGO_DEBUG='False'`

Save with `Ctrl+O`, `Enter`, leave with `Ctrl+X`. Protect the file: `chmod 600 .env`.

**Write the passwords down somewhere safe** (a password manager). `POSTGRES_PASSWORD` is used
the first time the database is created; changing it in `.env` later does not change the
database's password.

### B6. Start

```bash
docker compose up -d --build
docker compose ps
docker compose logs caddy
```

In the Caddy logs look for **"certificate obtained successfully"** (twice: `sougnadz.com` and
`www.sougnadz.com`). If it fails, check that the DNS A records point to this server
(`ping sougnadz.com`) and that ports 80/443 are open.

Then create the admin user (and optionally the demo data, for a first test only):

```bash
docker compose exec backend python manage.py createsuperuser
docker compose exec backend python manage.py seed_demo
```

Check in your browser: https://sougnadz.com/api/ and https://sougnadz.com/admin/.
https://www.sougnadz.com/api/ should jump to https://sougnadz.com/api/.

The real app builds (EAS) use `https://sougnadz.com` automatically (`PRODUCTION_URL` in
`app/src/config.ts`); Expo Go keeps using your laptop.

Before real users arrive, remove the demo data in the admin (or start from an empty database).

### B7. Updating to a new version

After merging changes on GitHub:

```bash
cd ~/sougna
git pull
docker compose up -d --build
```

Django updates the database tables automatically at start-up (`migrate`).
Users and photos are kept (they are in the volumes).

### B8. Backups (do this before every update, and regularly)

Database (one file, `.sql`):

```bash
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > backup-$(date +%F).sql
```

Uploaded files (photos, voice messages):

```bash
docker compose cp backend:/app/media ./media-backup-$(date +%F)
```

Copy both to your laptop (run this **on the laptop**, in PowerShell):

```powershell
scp -r sougna@YOUR.SERVER.IP:~/sougna/backup-*.sql sougna@YOUR.SERVER.IP:~/sougna/media-backup-* .
```

Automatic, off-server backups come later in Phase 3.

Restoring a database backup into an **empty** database:

```bash
docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"' < backup-2026-11-16.sql
```

### B9. When something goes wrong

| Problem                                     | What to do                                                    |
| ------------------------------------------- | ------------------------------------------------------------- |
| A page shows "Bad Request (400)"            | The address isn't in `DJANGO_ALLOWED_HOSTS` in `.env`. Fix it, then `docker compose up -d`. |
| "502 Bad Gateway"                           | Django isn't running: `docker compose logs backend`.          |
| The admin has no design (plain text)        | `docker compose restart backend` (it copies the CSS at start). |
| No HTTPS certificate                        | `docker compose logs caddy`; check the DNS A record and ports 80/443. |
| "password authentication failed" in the logs | `POSTGRES_PASSWORD` in `.env` was changed after the database was created. Put the old one back. |
| Server very slow / out of memory            | `free -h` and `docker stats`; check the swap file (B3).       |

`python manage.py check --deploy` reports two known items for now: email isn't set up yet
(later in Phase 3), and HSTS is off until you set `DJANGO_HSTS_SECONDS` (see `.env.example`).
