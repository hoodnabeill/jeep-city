# Shop server: setup and recovery

The server is one PC in the shop (D-88). It runs everything in Docker: the database, the API, the web app, the daily
backup and the Cloudflare Tunnel. Staff PCs reach it on the shop network; phones and staff outside reach it through the
tunnel. Nothing is opened on the router.

## What you need

- The server PC with **Ubuntu Server 24.04 LTS** installed (wired network cable, not Wi-Fi).
- A **fixed address** for it on the shop network: in the router, reserve an IP for the server's MAC address
  (example used below: `192.168.1.10`).
- A **Cloudflare account** with the shop's domain added (free plan is enough).
- A **cloud storage account** for the daily copy (Google Drive, OneDrive, Backblaze B2, … anything rclone supports).

## 1. Install Docker (once)

```bash
sudo apt update && sudo apt -y upgrade
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # log out and in again after this
sudo systemctl enable docker    # Docker, and with it every service, starts on boot
```

## 2. Get the code and the secrets

```bash
sudo apt -y install git
git clone <the GitHub repo URL> ~/jeepcity
cd ~/jeepcity/deploy
cp .env.example .env
nano .env    # fill in every value; generate secrets with: openssl rand -base64 36
chmod 600 .env
```

`deploy/.env` holds the secrets. It is never committed to git. Keep a copy of it in a password manager: a restore on a
new PC needs it.

## 3. Cloudflare Tunnel

1. Cloudflare dashboard → **Zero Trust → Networks → Tunnels → Create a tunnel** → type **Cloudflared** → name it `jeepcity`.
2. Copy the **token** from the install command into `CLOUDFLARE_TUNNEL_TOKEN` in `.env` (do not run the install command;
   Docker runs cloudflared).
3. **Public hostname**: e.g. `jc.<your-domain>` → service **HTTP** → `web:80`.

## 4. Cloud copy (rclone)

```bash
docker compose build backup
docker compose run --rm --entrypoint rclone backup config   # create a remote, e.g. "gdrive"
```

Then set `RCLONE_REMOTE=gdrive:jeepcity-backups` in `.env`. The config is saved in `deploy/rclone/` (not in git).

## 5. Start

```bash
docker compose up -d --build
docker compose ps                     # every service "running" / "healthy"
curl http://127.0.0.1/api/health      # {"ok":true,"db":true,...}
```

Create the first Admin (only once):

```bash
read -s -p "Admin password (10+ characters): " P; echo
docker compose exec -e ADMIN_USERNAME=ahmed -e ADMIN_NAME="أحمد الطنطاوي" -e ADMIN_PASSWORD="$P" api npx tsx src/seed.ts; unset P
```

The Byte data can be imported once, before the first real work order (README of the project → «Byte data»; run the
import against the server's database with `DATABASE_URL` from the `api` container).

Open `http://192.168.1.10` on a shop PC, and `https://jc.<your-domain>` from outside.

## 6. Settings to fill once (in the app, as Admin)

- Settings → عام: everything the shop wants.
- `share.baseUrl` = `https://jc.<your-domain>` so the QR on printed documents opens from anywhere (D-89).
- Windows and phone apps: server addresses `http://192.168.1.10/api` (shop) and `https://jc.<your-domain>/api` (outside).

## 7. Before go-live: test a restore

```bash
docker compose exec backup backup.sh now     # first backup
./scripts/restore-drill.sh                    # must print "Restore drill PASSED"
```

Run the drill again once a month. Results are kept in `deploy/restore-drill.log`.

## Daily checks (30 seconds)

- `curl http://127.0.0.1/api/health` → `"ok":true` and `"backupAgeHours"` under 26.
- The cloud folder has yesterday's `jeepcity-….dump`.

## Recovery

**A service misbehaves:** `docker compose ps`, `docker compose logs --tail=100 api`, then `docker compose restart api`.

**Restore last night's data on this server:**

```bash
./scripts/restore.sh                                              # lists backups
./scripts/restore.sh jeepcity-2026-11-01_0200.dump files-2026-11-01_0200.tar.gz
```

The script always makes a fresh backup first and asks you to type `RESTORE`.

**The server PC died — new PC:** do steps 1–5 on the new PC with the saved `.env`, then restore from the cloud:

```bash
docker compose run --rm --entrypoint rclone backup copy gdrive:jeepcity-backups /backups --max-age 3d
./scripts/restore.sh <the newest jeepcity-….dump> <the matching files-….tar.gz>
```

Give the new PC the same reserved IP and the shop PCs carry on as before. The tunnel follows the token.

**Updates:** `git pull && docker compose up -d --build` (migrations run on start). Make a backup first:
`docker compose exec backup backup.sh now`.
