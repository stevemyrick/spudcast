# spudcast security notes

spudcast is designed to run **LAN-only** next to your media server. This documents
its security posture and the results of an audit pass.

## Posture

- **Secrets stay server-side.** Jellyfin/TMDB/OMDb/YouTube keys live only in the
  backend (SQLite). `GET /api/settings` returns presence booleans, never values.
  Stream + artwork are **proxied** so the Jellyfin key never reaches a browser or
  an external IPTV player.
- **Passwords:** argon2id; login verification hashes even on unknown usernames to
  blunt timing-based user enumeration.
- **Sessions:** signed, `httpOnly`, `SameSite=Lax` cookies; `Secure` in production.
  SameSite=Lax is the primary CSRF defense for state-changing requests.
- **Authorization is server-side.** Every channel mutation re-checks
  owner/role (no IDOR); admin-only routes use `requireAdmin`. The TV/remote use
  **revocable device tokens**, scoped to view/tune only. IPTV uses a separate,
  regenerable capability key.
- **Input validation:** zod on all bodies; parameterized SQL via better-sqlite3
  prepared statements throughout. Uploads are extension/size validated, stored
  under generated names outside any web root, with traversal guards.

## Fixed in the audit pass

- **Login brute-force:** added a per-IP failure throttle with temporary lockout
  (429 + `Retry-After`). Previously unlimited.
- **iframe/SSRF via URL fields:** `z.url()` accepts `javascript:`/`data:`; the
  weather `embedUrl` (rendered in an iframe `src`) and the Jellyfin `baseUrl` are
  now restricted to `http(s)`.
- **Secret leakage into logs:** the request-log serializer redacts `token`,
  `key`, and `api_key` query params (they ride in URLs for `<video>`/`<img>`/IPTV).
- **Error handling:** stream/audio/artwork proxies return 404/502 instead of an
  unhandled 500 when Jellyfin is unreachable; rule queries are NaN-safe.
- **Headers:** `X-Content-Type-Options: nosniff` on all responses.

## Fixed in the second hardening pass

- **Timing-safe capability compare.** The IPTV key is now validated with
  `crypto.timingSafeEqual` (length-guarded) instead of `===`, closing a timing
  oracle. Device tokens are validated by an indexed SQL lookup (no client-side
  byte compare), so they carry no equivalent oracle.
- **Remote-control `Origin` check (CSWSH).** `/api/control` now rejects browser
  Origins that aren't localhost / private-LAN (or an explicit
  `SPUDCAST_ALLOWED_ORIGINS` allowlist). Non-browser clients (no Origin) are
  still accepted.
- **Stronger room codes.** Remote room codes went from 4 → 6 characters, and both
  room and pairing codes now use an unbiased 5-bit mask (`byte & 31`) over the
  32-char alphabet instead of biased modulo.
- **Rate-limit memory.** The login-throttle bucket sweep is now time-gated (runs
  at least once a minute), so stale buckets are reclaimed even below the
  size threshold.

## Known limitations / accepted risks (LAN posture)

- **No TLS by default.** Exposing spudcast to the internet requires a reverse
  proxy + TLS (also needed for the `Secure` cookie) or a VPN. See
  `synology-deploy.md`.
- **Remote-control WebSocket** accepts any localhost/private-LAN Origin (and a
  remote must still know the TV's 6-char room code shown only on-screen). Set
  `SPUDCAST_ALLOWED_ORIGINS` to tighten this if you front spudcast with a proxy.
- **Jellyfin `baseUrl`** is restricted to `http(s)` but not checked against
  private/metadata IP ranges — an admin is trusted to point it at their own
  server. Harden with an egress allowlist if that trust boundary changes.
- **Embedded content** (ws4kp, YouTube) runs in sandboxed iframes; only `http(s)`
  embed URLs are allowed and YouTube input is reduced to a validated video id.

## If you expose it beyond the LAN

1. Terminate TLS at a reverse proxy; keep `NODE_ENV=production` so cookies are `Secure`.
2. Set `SPUDCAST_ALLOWED_ORIGINS` to your proxy's public origin(s) so the
   `/api/control` WebSocket only accepts the intended front-end.
3. Rotate the IPTV key (`Settings → IPTV → Regenerate`) and treat the M3U/XMLTV
   URLs as secrets.
