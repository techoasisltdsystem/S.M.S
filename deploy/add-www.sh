#!/usr/bin/env bash
# Adds www.school.techoasisltd.com to the live site (name in nginx + HTTPS certificate). Run once on the VPS, after
# adding the DNS record (CNAME www.school -> school.techoasisltd.com, "DNS only"):
#   curl -fsSL https://raw.githubusercontent.com/techoasisltdsystem/techoasis-school/main/deploy/add-www.sh | sudo bash
# Only touches the school site's own nginx file. Safe to re-run.
set -euo pipefail

MAIN="school.techoasisltd.com"
WWW="www.school.techoasisltd.com"
AVAIL="/etc/nginx/sites-available/$MAIN.conf"
SITE="/etc/nginx/sites-enabled/$MAIN.conf"

IP="$(curl -fsS https://api.ipify.org)"
got="$(getent ahostsv4 "$WWW" | awk 'NR==1{print $1}' || true)"
if [ "$got" != "$IP" ]; then
    echo "$WWW does not point to this server yet (it points to: ${got:-nowhere}; this server is $IP)."
    echo "In Cloudflare DNS add:  CNAME  www.school  ->  $MAIN   with the proxy set to 'DNS only' (grey cloud)."
    echo "Wait a few minutes, then run this again. Nothing was changed."
    exit 1
fi

# 1. Make the nginx site file a real copy (certbot edited it inside the git folder, and a deploy would erase that)
if [ -L "$SITE" ]; then
    src="$(readlink -f "$SITE")"
    cp "$src" "$AVAIL.new" && mv -f "$AVAIL.new" "$AVAIL"
    ln -sf "$AVAIL" "$SITE"
    git -C /var/www/techoasis-school checkout --quiet -- deploy/nginx/ 2>/dev/null || true
    echo "==> Moved the nginx site file out of the website folder (HTTPS settings are kept)"
fi

# 2. Answer to the www name too
cp "$AVAIL" "$AVAIL.bak-$(date +%s)"
sed -i "s/server_name $MAIN;/server_name $MAIN $WWW;/" "$AVAIL"
nginx -t
systemctl reload nginx

# 3. Extend the HTTPS certificate to cover both names
certbot --nginx --non-interactive --agree-tos --expand --redirect -m school@techoasisltd.com -d "$MAIN" -d "$WWW"
nginx -t && systemctl reload nginx
echo "==> Done. https://$WWW now works."
