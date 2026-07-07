# Using the TV and phone remote

The spudcast **player** is "the TV": open it at `/tv` on a kiosk device and it joins the
on-air lineup full-screen, mid-program. Everything below works with a keyboard (handy for
testing) and, where noted, from the **phone remote** at `/tv/remote`.

## Pairing

Two separate codes, for two separate things:

- **Device pairing code** — shown on the TV the first time it boots (before it's paired).
  Enter it in the admin under **Devices** to authorize that TV. This is a one-time step;
  the TV then remembers a revocable device token.
- **Room code** — a short code the TV uses to accept a **phone remote**. Bring up the
  **guide** (`G`) or the **info** panel (`I`) and the TV shows the room code **and a QR
  code**. Scan the QR to open `/tv/remote` already joined to that TV, or open `/tv/remote`
  manually and type the code.

> The room code appears any time you open the guide or info panel, so you can pair a new
> phone remote at any point — you don't need to re-pair the TV itself.

## On-screen elements

- **Channel bug** (corner) — channel number, name, optional channel logo, and a ★ if the
  channel is a favorite. Flashes on tune.
- **Clock** (corner) — current time in the station timezone (set in admin **Settings →
  Display**).
- **Info banner** (`I`) — the "what's on" card: title, content rating, description, a live
  progress bar, start/end times, and **Up next**, plus the phone-remote QR + room code. It
  auto-shows briefly on tune and can be pinned with `I`.
- **Guide** (`G`) — a grid of every on-air channel's now/next, plus the remote-pairing QR.
- **Static transition** — a short burst of TV static masks each channel change.

## Controls

| Action | Keyboard | Phone remote |
| --- | --- | --- |
| Channel up / down | `↑` / `↓` (or PageUp/PageDown) | **CH ▲ / CH ▼** |
| Tune to a number | — | number pad + **⏎** |
| Last channel (jump back) | `L` | **↩ Last** |
| Toggle favorite (current channel) | `F` | **★ Fav** |
| Favorites-only surfing | — | **Fav surf** |
| Guide | `G` | **Guide** |
| Info banner | `I` | **Info** |
| Mute | — | **Mute** |
| CRT scanline effect | `S` | **CRT** |
| Aspect ratio (contain → cover → fill) | `A` | — |
| Retro sound/visual pack | `R` | — |

**Favorites** are remembered per-TV (browser storage). Star the channels you watch most,
then toggle **Fav surf** so channel up/down cycles only your favorites. **Last** bounces
between the current and previous channel, like a classic remote's "recall".

## Parental controls

Set a **station PIN** in admin **Settings → Parental controls**, then mark channels
**🔒 Locked** in the channel editor. On the TV:

- Locked channels are **skipped** while surfing (channel up/down), so they can't be stumbled
  into.
- Tuning directly to a locked channel shows a **PIN gate**. Enter the PIN on the remote
  keypad (or a keyboard); once correct, locked channels stay unlocked for the rest of the
  session.

You can also build **rating-limited auto-channels** (admin → auto-channel wizard → *Content
rating*), which only pull in items at the ratings you allow.

## Retro pack (`R`)

On by default, toggle with `R`:

- A short **channel-change chime** on each tune.
- **SMPTE color bars + static hiss** on the "dead channel" / stand-by slate.

## Sound and autoplay

Browsers block autoplay **with sound** until you interact with the page. If that happens the
TV starts **muted** so the picture still runs, and restores sound on your first key press or
tap. In a real kiosk, launch Chromium with `--autoplay-policy=no-user-gesture-required`
(see [kiosk-crt-setup.md](kiosk-crt-setup.md)) and sound plays immediately.

## Timezone

The clock, guide, and info-banner times render in the timezone set in admin **Settings →
Display** (default US Eastern). This is display-only — the deterministic "join live"
schedule is UTC-based and unaffected.
