# spudcast

Retro **linear TV** for your own media library. Unlike on-demand (Jellyfin), spudcast
runs predetermined channels — when you tune in, you join whatever is playing *mid-program*,
just like classic cable. Build channels by hand or auto-generate them by genre/decade/theme,
then stream a channel full-screen to a kiosk device → HDMI→RCA → a real CRT, with a channel
bug, static channel-change transition, on-screen guide, and a phone remote.

It sits next to your existing **Jellyfin** server (which handles the library, metadata, and
any transcoding) and stays out of the way: the schedule, guide, and "now playing" are all
served from a local SQLite cache, so an **idle TV makes zero media-disk activity** — your NAS
can sleep.

> Status: active development. Working today: Jellyfin sync, the deterministic scheduler, the
> kiosk player (mid-program join, channel bug, clock, info banner, static transition, grid
> guide, failover slate), TV pairing + phone remote (with QR pairing), favorites, parental
> controls, a retro sound/visual pack, multi-user auth, the Channel Creator, local clip
> uploads, rule-based auto-channels, a grid TV guide, weather channels, and IPTV export.
> Roadmap and details in `/.claude/plans`.

## What you can do

- **Connect Jellyfin** once (URL + API key) and sync your library into a local cache.
  Browse it with type/tag filters in the admin **Library**.
- **Build channels** by hand — drag in library items, upload your own bumpers/commercials —
  or **auto-generate** them: pick genre/decade/type/rating and spudcast assembles a
  self-updating channel (new matching content flows in automatically; you can still pin,
  reorder, remove, and cap the lineup).
- **See the whole schedule** in the admin **Guide** tab — a grid EPG with a live "Now &
  Next" wallboard; click any program for its metadata.
- **Pair a TV** at `/tv` (on-screen code → admin → Devices); it joins the on-air lineup
  mid-program, full-screen, with a channel bug, on-screen clock, and an info banner.
- **Control it from your phone** at `/tv/remote` — **scan the QR** shown on the TV to pair
  instantly, then channel up/down, number tune, **Last**-channel recall, **favorites**,
  guide, info, mute, and CRT toggle.
- **Keep it family-safe:** set a **station PIN** and mark channels locked (skipped while
  surfing, PIN-gated to tune to), or build rating-limited auto-channels.
- **Multi-user:** admins manage everything; regular users create/edit only their own channels.

The TV/remote controls, pairing, favorites, and parental PIN are documented in
**[docs/tv-and-remote.md](docs/tv-and-remote.md)**.

## Quick start (Docker — e.g. Synology)

```bash
cd docker
cp .env.example .env        # set TZ (and optionally a cookie secret)
docker compose up -d --build
```

Then open `http://<host>:8080`, complete the first-run wizard (admin account + Jellyfin
URL/key), **Refresh library**, create a channel, and set up a TV.

- Using the TV & phone remote: **[docs/tv-and-remote.md](docs/tv-and-remote.md)**
- Full NAS walkthrough: **[docs/synology-deploy.md](docs/synology-deploy.md)**
- Turning a Pi/mini-PC into the CRT TV: **[docs/kiosk-crt-setup.md](docs/kiosk-crt-setup.md)**
- Security posture & audit notes: **[docs/security.md](docs/security.md)**

> **LAN-only by default.** Don't expose spudcast to the internet without a reverse proxy +
> TLS (or a VPN). See the deploy doc.

## Develop

Requires Node 20+ and pnpm.

```bash
pnpm install
pnpm dev        # backend :8080, admin :5173, player :5174
```

Open the admin at http://localhost:5173 and complete the first-run wizard. The player
(the TV) is at http://localhost:5174 and the phone remote at http://localhost:5174/tv/remote.

```bash
pnpm build      # build the admin + player bundles
pnpm typecheck  # typecheck every package
pnpm test       # backend unit + integration tests (vitest)
```

## Architecture

```
Synology (Docker)                         Kiosk device (Chromium) ─HDMI→RCA─> CRT
┌─────────────────────────────┐           ┌──────────────────────────────┐
│ spudcast backend (Node/TS)  │  REST/WS  │ Player "the TV" (/tv)         │
│  - Jellyfin client + sync   │<────────> │  - asks "what's on Ch N now?" │
│  - deterministic scheduler  │           │  - <video> proxied MP4 stream │
│  - channels + library (DB)  │           │  - bug, clock, guide, remote  │
│  - stream/art proxy (keys   │           └──────────────────────────────┘
│    hidden) + SQLite (/data) │           Phone remote (/tv/remote) ─WS─> backend
│  - serves admin + player    │
└──────────┬──────────────────┘
           ▼  library / metadata / transcode + stream URLs
        Jellyfin
```

- **backend/** — Fastify API, SQLite, the scheduler; serves the built frontends in production.
- **web/admin/** — "Channel Creator": channels, library, devices, users, settings.
- **web/player/** — "the TV" (served at `/tv`) and the phone remote (`/tv/remote`).
- **shared/** — TypeScript types shared across the API and both frontends.

The scheduler is a pure function of time — a channel's "now playing" is
`(now − epoch) mod loopDuration` — so it's deterministic, survives restarts, drops you in
mid-program, and reads only from SQLite (no Jellyfin call to render the guide or advance a
channel). Stream and artwork requests are **proxied** so the Jellyfin API key never reaches
the browser.

## Configuration

| Env var | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8080` | HTTP port |
| `TZ` | `UTC` | Timezone for the **scheduled daily sync** (local `HH:mm`). Playback "join live" is UTC-based and unaffected. |
| `SPUDCAST_DATA_DIR` | `./data` | SQLite db, artwork cache, uploads (mount as a volume; keep on SSD) |
| `SPUDCAST_WEB_DIR` | `./public` | Built frontends (production) |
| `SPUDCAST_COOKIE_SECRET` | auto-generated | Session cookie signing secret (`openssl rand -hex 32`) |
| `SPUDCAST_ALLOWED_ORIGINS` | (LAN only) | Extra allowed `Origin`s for the remote-control WebSocket. localhost/private-LAN are always allowed; set this to your proxy's public origin if you front spudcast with one. |

> The **display timezone** for the on-screen clock, guide, and info banner is set in the admin
> **Settings → Display** (default US Eastern), separate from the `TZ` sync schedule above.

## Security posture

- Jellyfin/API keys live **server-side only** (SQLite, file-perm protected) and are never
  sent to a frontend; stream + artwork are proxied so keys aren't in the browser.
- Passwords are argon2id-hashed; sessions are httpOnly/SameSite cookies. The TV uses a
  **revocable device token**, not a login.
- Every channel mutation re-checks ownership/role server-side (no IDOR); uploads are
  type/size-validated and stored under generated names outside any web root.
