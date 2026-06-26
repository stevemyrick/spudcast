# Deploying spudcast on a Synology NAS

spudcast runs as a single Docker container that talks to your existing Jellyfin
server and serves both web apps (admin at `/`, the TV player at `/tv`). It's
designed to sit quietly next to Jellyfin and only touch your media disks when a
TV is actually streaming.

> **Network posture:** spudcast is **LAN-only by default**. Don't expose it to the
> internet without a reverse proxy and TLS (see [Exposing it safely](#exposing-it-safely)).

---

## 1. Prerequisites

- A Synology with **Container Manager** (DSM 7.2+) or the older **Docker** package.
- Your **Jellyfin URL** (e.g. `http://192.168.1.10:8096`) and a Jellyfin **API key**
  (Jellyfin → Dashboard → API Keys → New).
- A folder for spudcast's data on a **fast/SSD or system volume** — not the media
  volume — so spudcast's small, frequent writes don't keep the spinning media disks
  awake. Example: `/volume1/docker/spudcast/data`.

## 2. Get the image

You have two options:

**A. Build from source (recommended while spudcast is pre-release):**

```bash
git clone <your spudcast repo> && cd spudcast
docker build -f docker/Dockerfile -t spudcast:latest .
```

**B. docker compose (builds + runs):**

```bash
cd docker
cp .env.example .env       # set TZ, optionally a cookie secret
docker compose up -d
```

`docker/docker-compose.yml` maps `./data` → `/data` and publishes port `8080`.
On Synology, edit the volume line to your SSD path, e.g.:

```yaml
volumes:
  - /volume1/docker/spudcast/data:/data
```

## 3. Run it (Container Manager UI)

If you prefer the DSM UI over the CLI:

1. **Container Manager → Project → Create**, point it at the `docker/` folder
   (it contains `docker-compose.yml`), or import the compose file.
2. Set environment:
   - `TZ` = your timezone (e.g. `America/New_York`). This matters because the
     **scheduled daily library sync** fires at your local `HH:mm`. (The "join
     live" playback math is UTC-based and unaffected.)
   - *(optional)* `SPUDCAST_COOKIE_SECRET` = output of `openssl rand -hex 32`,
     so logins survive redeploys. If unset, spudcast generates and persists one
     under `/data`.
3. Map the data volume to your SSD folder (step 1).
4. Map port **8080**.
5. Start the project.

Health: the container exposes `GET /health`; Container Manager will show it healthy
once it's up.

## 4. First-run setup

1. Open `http://<nas-ip>:8080` in a browser.
2. The **first-run wizard** creates your admin account and stores your Jellyfin
   URL + API key (kept server-side only — never sent to any browser).
3. Go to **Settings**, confirm the Jellyfin connection ("Test connection"), and set
   a **daily sync time**.
4. Go to **Library → Refresh library** to pull your titles into spudcast's local
   cache. After this, browsing/scheduling never touches Jellyfin again until the
   next sync or actual playback — so the media disks can sleep.
5. Go to **Channels** and create one (by hand, or "✨ Auto channel" by genre/decade),
   then toggle it **On air**.
6. Set up a TV: see **[kiosk-crt-setup.md](./kiosk-crt-setup.md)**.

## 5. Quiet-NAS notes

- Keep `/data` (SQLite, artwork cache, uploads) on the **SSD/system volume**.
- spudcast contacts Jellyfin only on **manual Refresh**, the **daily sync**, and
  **while a TV is streaming** — never on idle, and never to render the guide.

## 6. Updating

```bash
cd spudcast && git pull
docker build -f docker/Dockerfile -t spudcast:latest .
cd docker && docker compose up -d   # recreates the container; /data persists
```

## IPTV export (Plex / Jellyfin / VLC / TiviMate)

spudcast can also expose its channels as a standard **M3U playlist + XMLTV guide**,
so they show up in other players:

- In the admin: **Settings → IPTV export** has ready-made URLs (they include a
  private key). Copy the **M3U** URL into your IPTV player and the **XMLTV** URL as
  the guide source.
- The Jellyfin API key is never exposed — streams are served through spudcast's own
  proxy, authorized by the IPTV key. **Regenerate** the key to revoke old URLs.
- Keep these URLs on your LAN.

> External players show the **current program** on each channel; the full
> mid-program "linear TV" experience (with static transitions, bug, and instant
> channel changes) is the spudcast **player** at `/tv`.

## Exposing it safely

spudcast binds `0.0.0.0:8080` for LAN access. To reach it from outside your network:

- Put it behind a **reverse proxy with TLS** (Synology's built-in reverse proxy, or
  Caddy/Traefik/nginx). TLS is also required for the `Secure` session cookie.
- Prefer a **VPN** (Tailscale/WireGuard) over a public port for a home setup.
- Never port-forward `8080` directly to the internet.

## Troubleshooting

- **Wizard won't load / blank page:** confirm the container is healthy
  (`docker logs spudcast`) and that you're hitting port 8080.
- **Daily sync fires at the wrong time:** set `TZ` correctly and recreate the
  container.
- **Library empty after refresh:** re-check the Jellyfin URL/key in Settings →
  Test connection; the URL must be reachable from the container (use the LAN IP,
  not `localhost`).
