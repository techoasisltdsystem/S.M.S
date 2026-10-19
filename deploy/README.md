# Hosting Tech Oasis School on a VPS

The site is plain files (HTML, CSS, JS, images) with no build step, so the VPS only needs **nginx**.
These files reproduce exactly what Vercel does: the `/student`, `/staff` and `/admin` addresses, the security
headers, caching, and blocking of private files (`.git`, `db/`, `docs/`, `deploy/`, `*.md`).

| File | What it does |
|---|---|
| `nginx/school.techoasisltd.com.conf` | The nginx site for school.techoasisltd.com |
| `nginx/security-headers.conf` | Security headers, shared by every part of the config |
| `setup-server.sh` | One-time setup: installs nginx, git and certbot, downloads the site, enables it, adds HTTPS |
| `deploy.sh` | Publishes the latest version from GitHub (`main`) |

Assumes Ubuntu or Debian. It only adds its own site and folder (`/var/www/techoasis-school`); other websites already
on the server keep running untouched.

## 1. Point the domain at the VPS

The site runs on the subdomain **school.techoasisltd.com**. In the DNS settings for techoasisltd.com (at your domain
registrar or DNS host), add these records (the second makes `www.school.techoasisltd.com` work too). Set the Cloudflare proxy to **DNS only** (grey cloud). Other records for the domain, such as the
POS subdomain and the email (MX) records, stay as they are.

| Type | Name | Value |
|---|---|---|
| A | `school` | your VPS IP |
| CNAME | `www.school` | `school.techoasisltd.com` |

Moving to a different address later (for example techoasisschool.com) means changing `server_name` in the nginx config,
the `DOMAINS` line in `setup-server.sh`, and the **Website address** in Admin → Settings → School.

## 2. Set up the server (once)

```bash
ssh -i ~/.ssh/oasis_vps root@YOUR_VPS_IP
curl -fsSL https://raw.githubusercontent.com/techoasisltdsystem/techoasis-school/main/deploy/setup-server.sh | sudo bash
```

If the domain already points at the server, HTTPS is set up automatically. If not, the script says so; once DNS has
updated, run:

```bash
sudo certbot --nginx --redirect -d school.techoasisltd.com -d www.school.techoasisltd.com
```

**Already set up without www?** After adding the CNAME record, run this once on the VPS. It adds the name to nginx and extends the
HTTPS certificate, touching only this site:

```bash
curl -fsSL https://raw.githubusercontent.com/techoasisltdsystem/techoasis-school/main/deploy/add-www.sh | sudo bash
```

## 3. Publish updates

After changes are pushed to GitHub (`main`):

```bash
ssh -i ~/.ssh/oasis_vps root@YOUR_VPS_IP 'bash /var/www/techoasis-school/deploy/deploy.sh'
```

## Notes

- **The nginx site file is a copy** in `/etc/nginx/sites-available/`, not a link into the website folder. Certbot adds the HTTPS
  settings to it, and `deploy.sh` resets the website folder to match GitHub, so a link would lose HTTPS on the next update.
  To change the server config later, edit that file on the server.
- **Private GitHub repo:** if the repository is made private, give the server read access with a
  [deploy key](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys) and set
  `REPO=git@github.com:techoasisltdsystem/techoasis-school.git` when running `setup-server.sh`.
- **Certificates** renew automatically (certbot installs a timer).
- **Social preview image and email links** use the address set in Admin → Settings → School → Website address
  (`https://school.techoasisltd.com`). Update the `og:image` tags in `index.html`, `course.html` and `verify.html` from the
  vercel.app address to `https://school.techoasisltd.com/brand/tech-oasis-social.png` once the domain is live on the VPS.
