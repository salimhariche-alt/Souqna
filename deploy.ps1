<#
  deploy.ps1 - put the newest Sougna on the live server (https://sougnadz.com).

  Run it in a VS Code terminal (PowerShell), in the project folder:

      cd C:\Users\salim\myapp
      powershell -ExecutionPolicy Bypass -File .\deploy.ps1

  What it does (it stops at the first problem and says where):
    1. Checks this laptop: branch "main", everything committed and pushed to GitHub
       (the server downloads the code from GitHub, not from this laptop).
    2. Builds the web app HERE (the server only has 1 GB of memory).
    3. On the server: git pull, database backup, rebuild + restart Django and Caddy,
       migrations (deploy/server-update.sh).
    4. Uploads the web app and switches the site to it (deploy/install-web.sh).
    5. Checks the website, a listing page, the API, the admin, a photo and www.

  Options:
    -SkipWeb       only update the server code (no web app build/upload)
    -SkipBackend   only rebuild and upload the web app
#>
param(
    [switch]$SkipWeb,
    [switch]$SkipBackend
)

$ErrorActionPreference = 'Stop'
$Server = 'sougna@104.248.191.120'
$Site = 'https://sougnadz.com'
$Repo = $PSScriptRoot
$BuildDir = Join-Path $env:TEMP 'sougna-web-build'
$Archive = Join-Path $env:TEMP 'sougna-web.tgz'
$Ssh = @('-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20')
$script:CurrentStep = 'start'
$started = Get-Date

function Show-Step([string]$Text) {
    $script:CurrentStep = $Text
    Write-Host ''
    Write-Host "=== $Text" -ForegroundColor Cyan
}

# Stop with an error if the last program (git, npx, ssh, ...) failed.
function Assert-Ok([string]$What) {
    if ($LASTEXITCODE -ne 0) { throw "$What failed (exit code $LASTEXITCODE)." }
}

# Download a page with curl.exe (built into Windows); returns status code and text.
function Get-Page([string]$Url) {
    $lines = @(& curl.exe -s -S -m 30 -w "`n%{http_code}" $Url)
    $code = [int]($lines[-1])
    $body = ($lines | Select-Object -SkipLast 1) -join "`n"
    return @{ Code = $code; Body = $body }
}

function Test-Page([string]$Name, [string]$Url, [string]$MustContain) {
    $page = Get-Page $Url
    $ok = ($page.Code -eq 200) -and ($page.Body -like "*$MustContain*")
    if ($ok) {
        Write-Host ("   OK    {0,-28} {1}" -f $Name, $Url) -ForegroundColor Green
    } else {
        Write-Host ("   FAIL  {0,-28} {1} (status {2})" -f $Name, $Url, $page.Code) -ForegroundColor Red
    }
    return $ok
}

try {
    Set-Location $Repo

    # ------------------------------------------------------------------ 1. laptop
    Show-Step '1/5 Checking this laptop'
    $branch = (& git rev-parse --abbrev-ref HEAD).Trim()
    Assert-Ok 'git'
    if ($branch -ne 'main') {
        throw "This laptop is on branch '$branch'. Merge your work into main first, then: git switch main"
    }
    $changes = & git status --porcelain --untracked-files=no
    if ($changes) {
        throw "Some changes are not committed yet:`n$($changes -join "`n")`nCommit and push them first."
    }
    & git fetch -q origin main
    Assert-Ok 'git fetch'
    $ahead = [int](& git rev-list --count origin/main..HEAD)
    $behind = [int](& git rev-list --count HEAD..origin/main)
    if ($ahead -gt 0) { throw "$ahead commit(s) on this laptop are not on GitHub yet. Run: git push" }
    if ($behind -gt 0) { throw "GitHub has $behind newer commit(s). Run: git pull" }
    $commit = (& git log -1 --format='%h %s').Trim()
    Write-Host "   main is up to date with GitHub: $commit"
    & ssh @Ssh $Server 'echo connected' | Out-Null
    Assert-Ok "Connecting to the server ($Server)"
    Write-Host "   server reachable"

    # ------------------------------------------------------------------ 2. build web
    if (-not $SkipWeb) {
        Show-Step '2/5 Building the web app on this laptop'
        Push-Location (Join-Path $Repo 'app')
        try {
            # Install packages again only if package-lock.json changed since the last install.
            $lock = Get-Item 'package-lock.json'
            $installed = Get-Item 'node_modules\.package-lock.json' -ErrorAction SilentlyContinue
            if (-not $installed -or $lock.LastWriteTime -gt $installed.LastWriteTime) {
                Write-Host '   installing packages (npm ci)...'
                & npm ci --no-audit --no-fund
                Assert-Ok 'npm ci'
            }
            if (Test-Path $BuildDir) { Remove-Item -Recurse -Force $BuildDir }
            & npx expo export --platform web --output-dir $BuildDir
            Assert-Ok 'Building the web app (npx expo export)'
        } finally {
            Pop-Location
        }
        if (-not (Test-Path (Join-Path $BuildDir 'index.html'))) { throw 'The build has no index.html.' }
        $usesSite = Get-ChildItem -Recurse (Join-Path $BuildDir '_expo') -Filter *.js |
            Select-String -SimpleMatch $Site -List
        if (-not $usesSite) { throw "The build does not use $Site (check PRODUCTION_URL in app/src/config.ts)." }
        if (Test-Path $Archive) { Remove-Item -Force $Archive }
        & tar.exe -czf $Archive -C $BuildDir .
        Assert-Ok 'Packing the web app (tar)'
        Write-Host ("   built and packed: {0:N1} MB" -f ((Get-Item $Archive).Length / 1MB))
    }

    # ------------------------------------------------------------------ 3. server
    if (-not $SkipBackend) {
        Show-Step '3/5 Updating the server (git pull, backup, rebuild, migrations)'
        & ssh @Ssh $Server 'cd ~/sougna && git pull --ff-only && sh deploy/server-update.sh'
        Assert-Ok 'Updating the server'
    }

    # ------------------------------------------------------------------ 4. upload web
    if (-not $SkipWeb) {
        Show-Step '4/5 Uploading the web app'
        & scp @Ssh -q $Archive "${Server}:/tmp/sougna-web.tgz"
        Assert-Ok 'Uploading (scp)'
        & ssh @Ssh $Server 'sh ~/sougna/deploy/install-web.sh /tmp/sougna-web.tgz'
        Assert-Ok 'Installing the web app on the server'
        Remove-Item -Force $Archive
    }

    # ------------------------------------------------------------------ 5. checks
    Show-Step '5/5 Checking the live site'
    $results = @()
    $results += Test-Page 'Website' "$Site/" '<title>Sougna</title>'
    $results += Test-Page 'Listing page (refresh)' "$Site/listing/1" '<title>Sougna</title>'
    $results += Test-Page 'API' "$Site/api/listings/" '"results"'
    $results += Test-Page 'Admin' "$Site/admin/login/" 'Sougna admin'

    $listings = (Get-Page "$Site/api/listings/").Body | ConvertFrom-Json
    $photo = ($listings.results | Where-Object { $_.cover_photo } | Select-Object -First 1).cover_photo
    if ($photo) {
        $code = & curl.exe -s -o NUL -m 30 -w '%{http_code}' $photo
        $ok = ($code -eq '200')
        $color = if ($ok) { 'Green' } else { 'Red' }
        $label = if ($ok) { 'OK  ' } else { 'FAIL' }
        Write-Host ("   {0}  {1,-28} {2}" -f $label, 'Photo', $photo) -ForegroundColor $color
        $results += $ok
    } else {
        Write-Host '   (no listing with a photo to test)'
    }

    $www = & curl.exe -s -o NUL -m 30 -w '%{http_code} %{redirect_url}' 'https://www.sougnadz.com/'
    $ok = ($www -eq '301 https://sougnadz.com/')
    $color = if ($ok) { 'Green' } else { 'Red' }
    $label = if ($ok) { 'OK  ' } else { 'FAIL' }
    Write-Host ("   {0}  {1,-28} {2}" -f $label, 'www redirect', $www) -ForegroundColor $color
    $results += $ok

    if ($results -contains $false) { throw 'Some checks failed (see FAIL above).' }

    $minutes = [math]::Round(((Get-Date) - $started).TotalMinutes, 1)
    Write-Host ''
    Write-Host "DEPLOY OK - $commit is live on $Site ($minutes min)" -ForegroundColor Green
    exit 0
}
catch {
    Write-Host ''
    Write-Host "DEPLOY FAILED during: $script:CurrentStep" -ForegroundColor Red
    Write-Host "   $($_.Exception.Message)" -ForegroundColor Red
    Write-Host '   Server logs: ssh sougna@104.248.191.120 "cd ~/sougna && docker compose logs --tail 50 backend"'
    exit 1
}
