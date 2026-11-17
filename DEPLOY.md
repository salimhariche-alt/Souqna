# Putting Sougna online (Docker)

This guide runs Sougna on one server with Docker Compose: the **backend** (API + admin) and
the **web version of the app**, all at **https://sougnadz.com**.

```
 phone app / browser
        |  https (port 443)
        v
   +---------+      +------------------------------+      +--------------+
   |  caddy  | ---> | backend (Django + gunicorn)  | ---> |  db          |
   +---------+      +------------------------------+      | (PostgreSQL) |
     |   /api/, /admin/, /api-auth/ go to Django             +--------------+
     |   also serves /media/ (photos, voice), /static/ (admin CSS)
     |   and the web app (everything else, from ./web/current)
```

**Updating the live site: run `deploy.ps1` on the laptop** (Part C). It does everything.

- **caddy** - the web server. Gets and renews the HTTPS certificate by itself, and serves
  the web app (built on the laptop, see Part C).
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

**Status: done (Step 3.4, 17 November 2026).** Sougna's backend runs at **https://sougnadz.com**
on a DigitalOcean Droplet (Ubuntu 24.04 LTS, 1 GB memory, San Francisco, IP
`104.248.191.120`). B1-B8 record exactly what was done, so it can be repeated on a new server.
For everyday work, jump to **B9 (everyday commands)**.

Boxes marked `powershell` run **on your laptop**; boxes marked `bash` run **on the server**
(after `ssh sougna@104.248.191.120`).

### B1. What you need

- A **VPS** with **Ubuntu 24.04 LTS**, 1 GB memory, ~25 GB disk. Sougna uses a DigitalOcean
  Droplet created with your laptop's **SSH key** (`C:\Users\salim\.ssh\id_ed25519.pub`, see
  CLAUDE.md "Server") instead of a password.
- A **domain name**: **`sougnadz.com`** (Namecheap). Two DNS **A records** point to the server's
  IP address: `@` (`sougnadz.com`) and `www` (`www.sougnadz.com`). Check in PowerShell:
  `Resolve-DnsName sougnadz.com -Server 8.8.8.8`.

### B2. A safe everyday user, then lock SSH

Working as `root` every day is risky. Create the user **`sougna`** with admin rights (`sudo`),
give it the same SSH key as root, and let it use `sudo` without a password (it has no password
at all: only your private key opens it):

```bash
# as root (ssh root@104.248.191.120) - only possible BEFORE root login is turned off
adduser --disabled-password --gecos "" sougna
usermod -aG sudo sougna
install -d -m 700 -o sougna -g sougna /home/sougna/.ssh
install -m 600 -o sougna -g sougna /root/.ssh/authorized_keys /home/sougna/.ssh/authorized_keys
echo "sougna ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/90-sougna
chmod 440 /etc/sudoers.d/90-sougna && visudo -cf /etc/sudoers.d/90-sougna
```

**Test before locking anything** (from the laptop): `ssh sougna@104.248.191.120 "sudo whoami"`
must answer `root`.

Then turn off password login and root login. The file name starts with `00-` on purpose: SSH
uses the FIRST value it reads, and DigitalOcean's `50-cloud-init.conf` says
`PasswordAuthentication yes`.

```bash
sudo tee /etc/ssh/sshd_config.d/00-sougna-hardening.conf <<EOF
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
EOF
sudo sshd -t && sudo systemctl restart ssh
sudo sshd -T | grep -E "^(passwordauthentication|permitrootlogin) "   # both "no"
```

Check from the laptop: `ssh sougna@104.248.191.120` works; `ssh root@104.248.191.120` says
"Permission denied (publickey)".

> If you ever lose your laptop's private key: DigitalOcean website -> the Droplet -> **Access ->
> Launch Droplet Console** still works; then add a new public key to
> `/home/sougna/.ssh/authorized_keys`.

### B3. Firewall: only SSH, HTTP and HTTPS

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp comment "SSH"          # FIRST, so you can't lock yourself out
sudo ufw allow 80/tcp comment "HTTP (Caddy, certificates)"
sudo ufw allow 443/tcp comment "HTTPS"
sudo ufw allow 443/udp comment "HTTPS (HTTP/3)"
sudo ufw --force enable
sudo ufw status verbose
```

(Docker opens the ports it publishes by itself, but only Caddy publishes any: 80 and 443.)

### B4. Swap and automatic security updates

2 GB of **swap** (emergency memory on the disk), used only when really needed:

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo "/swapfile none swap sw 0 0" | sudo tee -a /etc/fstab
echo "vm.swappiness=10" | sudo tee /etc/sysctl.d/90-sougna-swap.conf && sudo sysctl --system
free -m        # Swap: 2047
```

**Automatic security updates** (installed every day; the server does NOT restart by itself):

```bash
sudo apt-get install -y unattended-upgrades
sudo tee /etc/apt/apt.conf.d/20auto-upgrades <<EOF
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
sudo unattended-upgrade          # install the waiting ones now
```

If the file `/var/run/reboot-required` exists (e.g. after a new Linux kernel), restart when
convenient - see B9.

### B5. Docker (from Docker's official package source)

```bash
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
. /etc/os-release
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${UBUNTU_CODENAME:-$VERSION_CODENAME} stable" | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker sougna      # then log out and in again
docker run --rm hello-world         # "Hello from Docker!"
```

Docker's key fingerprint must be `9DC8 5822 9FC7 DD38 854A E2D8 8D81 803C 0EBF CD88`.

### B6. Get the code with a read-only deploy key

The server has its **own** key that can only **read** this one repository (never write).
Its private key never leaves the server.

```bash
ssh-keygen -t ed25519 -N "" -C "sougna-server-deploy (read-only)" -f ~/.ssh/github_deploy
cat > ~/.ssh/config <<EOF
Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/github_deploy
    IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config
ssh-keyscan -t ed25519 github.com >> ~/.ssh/known_hosts
ssh-keygen -lf ~/.ssh/known_hosts   # must show SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU
cat ~/.ssh/github_deploy.pub        # the PUBLIC key, for GitHub
```

On GitHub: repository **Settings -> Deploy keys -> Add deploy key**. Title
`sougna-server (DigitalOcean)`, paste the public key as **one line** (copy it from a file, not
from the terminal: line breaks make GitHub say "Key is invalid"), leave **Allow write access
unticked**, **Add key**. A copy of the public key is in `C:\Users\salim\deploy_key.pub` on the
laptop (outside the repository). Then:

```bash
ssh -T git@github.com     # "Hi salimhariche-alt/Souqna! You've successfully authenticated"
git clone git@github.com:salimhariche-alt/Souqna.git ~/sougna
```

### B7. The `.env` file (secrets made on the server, never shown)

```bash
cd ~/sougna
umask 077
python3 - <<'EOF'
import re, secrets
text = open(".env.example", encoding="utf-8").read()
text = re.sub(r"^DJANGO_SECRET_KEY=.*$", "DJANGO_SECRET_KEY='%s'" % secrets.token_urlsafe(50), text, flags=re.M)
text = re.sub(r"^POSTGRES_PASSWORD=.*$", "POSTGRES_PASSWORD='%s'" % secrets.token_urlsafe(32), text, flags=re.M)
open(".env", "w", encoding="utf-8").write(text)
EOF
chmod 600 .env
grep -c change-me .env      # 0
```

The other values in `.env.example` are already right for the live server
(`SITE_ADDRESS='sougnadz.com'`, `DJANGO_ALLOWED_HOSTS='sougnadz.com,www.sougnadz.com'`,
`DJANGO_DEBUG='False'`, SMS and alerts printed in the logs). **Never print `.env` or put it in
Git.** `POSTGRES_PASSWORD` is used when the database is created the first time; changing it
later in `.env` does not change the database's password.

### B8. Start, certificates, data, admin

```bash
cd ~/sougna
docker compose up -d --build     # first time: a few minutes
docker compose ps                # db (healthy), backend, caddy: all "Up"
docker compose logs caddy | grep "certificate obtained successfully"   # sougnadz.com + www
```

At every start the backend updates the database tables (`migrate`), creates the cache table
and copies the admin's CSS.

Load **only the 5 categories** (Women, Men, Kids, Home, Electronics in fr/ar/en):

```bash
docker compose exec backend python manage.py shell -c "from listings.management.commands.seed_demo import Command; Command().load_categories()"
```

Or categories **plus** 30 fake listings from 6 demo sellers (`055000000X`, cannot log in):
`docker compose exec backend python manage.py seed_demo`. **On sougnadz.com the fake listings
ARE loaded (for testing) - remove them before real users arrive** (B9).

Create the admin user - run it yourself so the password never appears anywhere else
(PowerShell on the laptop; `-t` lets you type):

```powershell
ssh -t sougna@104.248.191.120 "cd ~/sougna && docker compose exec backend python manage.py createsuperuser"
```

Checks (done 17 November 2026, all OK):

| Address | Expected |
| --- | --- |
| https://sougnadz.com/admin/ | "Sougna admin" login, with its design, padlock, no warning |
| https://sougnadz.com/api/listings/ | the listings, photo addresses `https://sougnadz.com/media/...` |
| https://www.sougnadz.com/... | jumps to https://sougnadz.com/... |
| http://sougnadz.com/... | jumps to https:// |

Certificates: Let's Encrypt, renewed by Caddy automatically (the first ones are valid until
15 February 2027).

### B9. Everyday commands

Connect (laptop, PowerShell), then go to the project folder:

```powershell
ssh sougna@104.248.191.120
```

```bash
cd ~/sougna
```

| What | Command (on the server, in `~/sougna`) |
| --- | --- |
| Are the 3 parts running? | `docker compose ps` |
| Django's logs live (**SMS codes, urgent alerts**, errors); `Ctrl+C` stops watching | `docker compose logs -f --tail 50 backend` |
| Web server / certificate logs | `docker compose logs -f --tail 50 caddy` |
| Restart Django only | `docker compose restart backend` |
| Restart everything | `docker compose restart` |
| Stop everything (data is KEPT) / start again | `docker compose down` / `docker compose up -d` |
| Memory use | `docker stats --no-stream` and `free -m` |
| Run a Django command | `docker compose exec backend python manage.py <command>` |

Django's logs from the laptop in one line:
`ssh sougna@104.248.191.120 "cd ~/sougna && docker compose logs -f --tail 50 backend"`

**Update to a new version:** use **`deploy.ps1` on the laptop** (Part C) - it makes a backup,
updates the server and the web app, and checks everything. By hand, on the server, it would be:

```bash
cd ~/sougna
git pull --ff-only
sh deploy/server-update.sh     # backup, rebuild + restart backend and Caddy, migrations
```

Users, photos and voice messages are kept (they live in the volumes).
After changing only `.env`: `docker compose up -d`.

**Restart the whole server** (e.g. when `/var/run/reboot-required` exists after security
updates): `sudo reboot`. Everything starts again by itself (`restart: unless-stopped`); wait a
minute, reconnect, and check `docker compose ps`.

**Remove the fake listings** before launch: admin -> Users -> the 6 demo sellers (phones
`0550000001`-`0550000006`) -> delete them with their listings, or ask Claude for a command.

**Never** run `docker compose down -v` on the server: `-v` deletes the database and photos.

### B10. Backups (before every update, and regularly)

**`deploy.ps1` backs up the database automatically before every update**: on the server in
`~/backups/db-<date>.sql.gz` (the 10 newest are kept). They are still on the same server, so
copy them to your laptop now and then (below).

Database by hand (one file, `.sql`):

```bash
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > backup-$(date +%F).sql
```

Uploaded files (photos, voice messages):

```bash
docker compose cp backend:/app/media ./media-backup-$(date +%F)
```

Copy both to your laptop (run this **on the laptop**, in PowerShell):

```powershell
scp -r "sougna@104.248.191.120:~/sougna/backup-*.sql" "sougna@104.248.191.120:~/sougna/media-backup-*" .
scp "sougna@104.248.191.120:~/backups/db-*.sql.gz" .     # the automatic ones
```

Automatic, off-server backups come later in Phase 3.

Restoring a database backup into an **empty** database:

```bash
docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"' < backup-2026-11-17.sql
```

### B11. When something goes wrong

| Problem | What to do |
| --- | --- |
| A page shows "Bad Request (400)" | The address isn't in `DJANGO_ALLOWED_HOSTS` in `.env`. Fix it, then `docker compose up -d`. |
| "502 Bad Gateway" | Django isn't running (or still starting - wait 10 s): `docker compose logs backend`. |
| The admin has no design (plain text) | `docker compose restart backend` (it copies the CSS at start). |
| No HTTPS certificate | `docker compose logs caddy`; check the DNS A records and ports 80/443 (`sudo ufw status`). |
| "password authentication failed" in the logs | `POSTGRES_PASSWORD` in `.env` was changed after the database was created. Put the old one back. |
| Server very slow / out of memory | `free -m` and `docker stats --no-stream`; check the swap (B4). |
| `git pull` says "Permission denied (publickey)" | The deploy key was removed on GitHub: redo B6 (new key, add it again). |
| Many "404" lines from unknown visitors in the logs | Normal: robots scan every new website. |
| https://sougnadz.com shows a blank page or "404" | The web app isn't uploaded: run `deploy.ps1` (or `-SkipBackend`). Check `ls -l ~/sougna/web/current` on the server. |

`python manage.py check --deploy` reports two known items for now: email isn't set up yet
(later in Phase 3), and HSTS is off until you set `DJANGO_HSTS_SECONDS` (see `.env.example`).

---

## Part C - The web app and `deploy.ps1` (every update)

### C1. How the web app works

The Expo app also runs in a web browser. `npx expo export --platform web` turns it into plain
files (`index.html`, JavaScript, fonts, images - about 4 MB). It is built **on the laptop**
(the server only has 1 GB of memory) and uploaded to the server:

```
~/sougna/web/releases/2026-11-17-153000/   one folder per upload (the 3 newest are kept)
~/sougna/web/current  ->  releases/...     the version visitors get (switched in one step)
```

`web/` is not in Git. Caddy serves it at **https://sougnadz.com** (see `Caddyfile`):

| Address | Served by |
| --- | --- |
| `/api/...`, `/admin/...`, `/api-auth/...` | Django |
| `/media/...` | uploaded photos and voice messages (`.m4a` sent as `audio/mp4`) |
| `/static/...` | the admin's CSS |
| anything else | the web app; addresses that are not files (e.g. `/listing/12` after a refresh) get `index.html`, and the app opens the right screen |
| `https://www.sougnadz.com/...` | redirect to `https://sougnadz.com/...` |

Files with a fingerprint in their name (`/_expo/static/...`, `/assets/...`) are cached by
browsers for a year; `index.html` is always checked again, so an update shows straight away.

Which backend the app uses (`app/src/config.ts`): **production builds** (this web build, and
later the EAS phone builds) use `https://sougnadz.com`; **Expo Go / `npx expo start`** keeps
using your laptop (`http://<laptop Wi-Fi address>:8000`). Voice messages can be played in the
web app but not recorded (browsers record WebM; the server accepts only AAC/M4A).

### C2. Update the live site with `deploy.ps1`

1. Merge your work into `main` and push it, so GitHub has it (the server downloads from
   GitHub). Your laptop must be on `main` with nothing left to commit.
2. In a VS Code terminal (PowerShell):

   ```powershell
   cd C:\Users\salim\myapp
   powershell -ExecutionPolicy Bypass -File .\deploy.ps1
   ```

   (`-ExecutionPolicy Bypass` lets Windows run this one script; it changes no setting.)

3. Wait 3-6 minutes. It shows 5 steps:

   | Step | What happens |
   | --- | --- |
   | 1/5 | checks the laptop (branch `main`, committed, same as GitHub) and that the server answers |
   | 2/5 | builds the web app on the laptop (`npx expo export`); a failure here changes nothing on the server |
   | 3/5 | server: `git pull`, database backup (`~/backups`), rebuild + restart Django and Caddy (about 10-20 seconds offline), migrations (`deploy/server-update.sh`) |
   | 4/5 | uploads the web app and switches to it (`deploy/install-web.sh`) |
   | 5/5 | checks the website, a listing page, the API, the admin, a photo and the www redirect |

4. It ends with a green **`DEPLOY OK`**, or a red **`DEPLOY FAILED during: <step>`** with the
   reason. Nothing is half-done on the web side: a failed upload keeps the old web app.

Options: `.\deploy.ps1 -SkipWeb` (server only), `.\deploy.ps1 -SkipBackend` (web app only).

### C3. Go back to the previous web app version

```bash
cd ~/sougna
ls web/releases                                   # the 3 newest uploads
ln -sfn releases/<older folder> web/current       # e.g. releases/2026-11-17-153000
```

No restart needed. (Going back on the backend: `git checkout <older commit>` on the server and
`sh deploy/server-update.sh` - ask Claude first, database changes can't always be undone.)
