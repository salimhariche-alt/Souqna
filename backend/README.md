# Souqna API (backend)

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

# 7. Create your admin login (asks for username, email, password)
python manage.py createsuperuser
```

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

Stop the server with `Ctrl+C`. Leave the virtual environment with `deactivate`.

## After pulling new code

```powershell
python -m pip install -r requirements.txt   # if requirements.txt changed
python manage.py migrate                    # if there are new migrations
```
