#!/usr/bin/env bash
# One-time setup of Tech Oasis School on an Ubuntu/Debian VPS. Run as root (or with sudo):
#   curl -fsSL https://raw.githubusercontent.com/techoasisltdsystem/techoasis-school/main/deploy/setup-server.sh | sudo bash
# Safe to re-run. It only adds its own nginx site and folder; other sites on the server are not touched.
set -euo pipefail

REPO="${REPO:-https://github.com/techoasisltdsystem/techoasis-school.git}"
DIR="/var/www/techoasis-school"
AVAIL="/etc/nginx/sites-available/school.techoasisltd.com.conf"   # server-side copy; certbot adds the HTTPS settings here
SITE="/etc/nginx/sites-enabled/school.techoasisltd.com.conf"
DOMAINS=(school.techoasisltd.com www.school.techoasisltd.com)

echo "==> Installing nginx, git and certbot (if missing)"
apt-get update -qq
apt-get install -y -qq nginx git certbot python3-certbot-nginx >/dev/null

echo "==> Getting the site into $DIR"
if [ -d "$DIR/.git" ]; then
    git -C "$DIR" fetch --quiet origin main && git -C "$DIR" reset --quiet --hard origin/main
else
    git clone --quiet --depth 1 --branch main "$REPO" "$DIR"
fi
chown -R www-data:www-data "$DIR"
git config --global --add safe.directory "$DIR"

echo "==> Enabling the nginx site"
# A copy, not a link into the git folder: deploys reset that folder to match GitHub, which would erase the HTTPS settings.
# An existing copy is kept as it is, so re-running this script never removes HTTPS.
[ -f "$AVAIL" ] || cp "$DIR/deploy/nginx/school.techoasisltd.com.conf" "$AVAIL"
ln -sf "$AVAIL" "$SITE"
nginx -t
systemctl reload nginx

echo "==> HTTPS certificate"
IP="$(curl -fsS https://api.ipify.org || true)"
ready=1
for d in "${DOMAINS[@]}"; do
    [ "$(getent ahostsv4 "$d" | awk 'NR==1{print $1}')" = "$IP" ] || ready=0
done
if [ "$ready" = 1 ]; then
    certbot --nginx --non-interactive --agree-tos --redirect -m school@techoasisltd.com $(printf -- '-d %s ' "${DOMAINS[@]}")
else
    echo "    Skipped: ${DOMAINS[*]} do not point to this server ($IP) yet."
    echo "    Add a DNS A record for ${DOMAINS[*]} -> $IP, wait for them to resolve, then run:"
    echo "    sudo certbot --nginx --redirect -d school.techoasisltd.com -d www.school.techoasisltd.com"
fi

echo "==> Done. Site files: $DIR   Update later with: sudo bash $DIR/deploy/deploy.sh"
