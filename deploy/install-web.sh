#!/bin/sh
# Runs ON THE SERVER (called by deploy.ps1): installs a new version of the web app.
#   install-web.sh /tmp/sougna-web.tgz
# The files go to web/releases/<date-time>; then web/current switches to them in one
# step, so visitors never see half-copied files. The 3 newest versions are kept
# (to go back: point web/current at an older folder, see DEPLOY.md).
set -eu

ARCHIVE="$1"
cd "$(dirname "$0")/.."            # the project folder, ~/sougna
RELEASE="$(date +%Y-%m-%d-%H%M%S)"

mkdir -p "web/releases/$RELEASE"
tar -xzf "$ARCHIVE" -C "web/releases/$RELEASE"
if [ ! -f "web/releases/$RELEASE/index.html" ]; then
    echo "ERROR: index.html missing in the upload - web app NOT changed"
    rm -rf "web/releases/$RELEASE"
    exit 1
fi
chmod -R a+rX "web/releases/$RELEASE"

ln -sfn "releases/$RELEASE" web/current.new
mv -T web/current.new web/current          # the switch (one step)

ls -1dt web/releases/*/ | tail -n +4 | xargs -r rm -rf
rm -f "$ARCHIVE"
echo "   web app now: web/releases/$RELEASE ($(find "web/releases/$RELEASE" -type f | wc -l) files)"
echo "WEB INSTALL OK"
