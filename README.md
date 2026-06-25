# spudcast

Retro **linear TV** for your own media library. Unlike on-demand (Jellyfin), spudcast
runs predetermined channels — when you tune in, you join whatever is playing *mid-program*,
just like classic cable. Build channels by hand or auto-generate them by genre/decade/theme,
then stream a channel full-screen to a kiosk device → HDMI→RCA → a real CRT.

> Status: early development. **M0 (scaffold)** is in place — monorepo, backend with SQLite +
> first-run setup/auth, and the admin + player web apps. See
> `/.claude/plans` for the full roadmap.

## Architecture

- **backend/** — Node + TypeScript (Fastify) API, SQLite, the scheduler, and it serves the
  built frontends in production.
- **web/admin/** — "Channel Creator": configure channels, browse the library, settings.
- **web/player/** — "the TV": full-screen kiosk playback (served at `/tv`).
- **shared/** — TypeScript types shared across the API and both frontends.

The library + metadata come primarily from your existing **Jellyfin** server (which also
handles any transcoding); TMDB/OMDb fill gaps, and YouTube embeds cover retro commercials.

## Develop

Requires Node 20+ and pnpm.

```bash
pnpm install
pnpm dev        # backend :8080, admin :5173, player :5174
```

Then open the admin at http://localhost:5173 and complete the first-run wizard
(create an admin account + connect Jellyfin).

```bash
pnpm build      # build the admin + player bundles
pnpm typecheck  # typecheck every package
```

## Run with Docker (e.g. Synology)

```bash
docker compose -f docker/docker-compose.yml up -d --build
```

Open `http://<host>:8080` for the Channel Creator and `http://<host>:8080/tv` on the
kiosk device. The SQLite db, artwork cache and uploads live in the `/data` volume — put it
on your SSD/system volume so an idle TV doesn't keep the media disks spinning.

## Configuration

| Env var | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8080` | HTTP port |
| `SPUDCAST_DATA_DIR` | `./data` | SQLite db, artwork cache, uploads |
| `SPUDCAST_WEB_DIR` | `./public` | Built frontends (production) |
| `SPUDCAST_COOKIE_SECRET` | auto-generated | Session cookie signing secret |
