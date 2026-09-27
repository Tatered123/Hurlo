# Deploying Hurlo on an Ubuntu VPS

The proxy needs two things a plain IP can't give it: **HTTPS** (service
workers refuse to register otherwise) and an **exit outside filtered
networks**. A cheap VPS + a free domain + Caddy gives you both. Total setup
time: ~10 minutes.

## 1. DNS

Point an `A` record at your VPS IP (your registrar's DNS panel, or a free
service like DuckDNS). Wait for it to resolve before continuing — Caddy's
certificate issuance needs it.

## 2. Get the site onto the VPS

```bash
sudo apt update && sudo apt install -y python3 caddy git
sudo mkdir -p /opt/hurlo && sudo chown $USER /opt/hurlo
git clone https://github.com/YOU/YOUR-REPO /opt/hurlo
```

(Or upload with `scp -r` / SFTP if you'd rather not push `projects/` to
GitHub — it's ~400 MB with the covers and game libraries.)

## 3. Regenerate the catalog

```bash
cd /opt/hurlo
python3 tools/build_catalog.py
```

## 4. Run it as a service (survives reboots and SSH logouts)

```bash
sudo cp deploy/hurlo.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now hurlo
systemctl status hurlo        # should say active (running)
```

The app now listens on 127.0.0.1:8123 — loopback only, so the raw port is
not exposed to the internet.

## 5. HTTPS + domain via Caddy

Edit `deploy/Caddyfile`, replace `yourdomain.com` with your domain, then:

```bash
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl enable --now caddy
sudo ufw allow 80,443/tcp    # if ufw is enabled
```

Caddy fetches and renews the TLS certificate automatically and proxies
WebSocket connections (the wisp relay) without extra config.

## 6. Done

Open `https://yourdomain.com` — the Proxy page prewarms Scramjet v2 and both
engines exit through the VPS's own network. Leave the Exit field empty; it's
only for pointing at a *different* relay.

## Updating later

```bash
cd /opt/hurlo && git pull
python3 tools/build_catalog.py
sudo systemctl restart hurlo
```

## Notes

- `server.py` is stdlib-only — no pip installs needed.
- The relay lives at `wss://yourdomain.com/wisp/` — that's also what you'd
  paste into the Exit field of any *other* Hurlo instance (e.g. your local
  copy) to use the VPS as the exit.
- If you ever want the games to survive without git, keep `projects/` on the
  VPS disk — the catalog reads it at startup.
