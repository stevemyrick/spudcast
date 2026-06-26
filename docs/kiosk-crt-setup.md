# Turning a device into "the TV" (Chromium kiosk → CRT)

The spudcast **player** is just a full-screen web page at `http://<nas-ip>:8080/tv`.
Any device that can run Chromium in kiosk mode and output video can be your TV — a
Raspberry Pi, a mini-PC, an old laptop. For the full retro effect, send its HDMI
through an **HDMI→RCA (composite) converter** into a real CRT.

```
spudcast (NAS :8080/tv)  ──HDMI──>  [HDMI→RCA converter]  ──composite──>  CRT
        kiosk device (Pi / mini-PC, Chromium full-screen)
```

---

## 1. Point Chromium at the player

The only URL the TV needs:

```
http://<nas-ip>:8080/tv
```

Launch Chromium in kiosk mode:

```bash
chromium-browser \
  --kiosk \
  --noerrordialogs \
  --disable-infobars \
  --autoplay-policy=no-user-gesture-required \
  --check-for-update-interval=31536000 \
  "http://<nas-ip>:8080/tv"
```

> `--autoplay-policy=no-user-gesture-required` is important — without it the browser
> may block the video from auto-starting.

On a Raspberry Pi OS / Debian desktop, use `chromium` or `chromium-browser` depending
on your distro.

## 2. Pair the TV (one time)

When the player first loads it shows a **pairing code**. In the spudcast admin on any
device: **Devices → enter the code → Pair**. The TV stores a device token and starts
playing the on-air lineup. No login lives on the TV.

## 3. Phone remote

On your phone (same network), open:

```
http://<nas-ip>:8080/tv/remote
```

Open the on-screen **Guide** on the TV (it shows a short **room code**), enter that
code on the phone, and you get channel up/down, a number pad, Guide, and Mute.

## 4. Stop the screen from blanking

On a Pi/desktop you don't want the screensaver or DPMS power-saving kicking in.

For X11 (add to your autostart, see below):

```bash
xset s off          # no screensaver
xset -dpms          # no display power management
xset s noblank
```

Or install `unclutter` to hide the mouse cursor:

```bash
sudo apt-get install -y unclutter
unclutter -idle 0.1 &
```

## 5. Autostart on boot (Raspberry Pi OS / LXDE example)

Create `~/.config/lxsession/LXDE-pi/autostart` (or `LXDE/autostart`):

```
@xset s off
@xset -dpms
@xset s noblank
@unclutter -idle 0.1
@chromium-browser --kiosk --noerrordialogs --disable-infobars --autoplay-policy=no-user-gesture-required "http://<nas-ip>:8080/tv"
```

For a systemd/Wayland (`cage`/`labwc`) setup, run the same Chromium command as your
session's startup program instead.

## 6. CRT / composite output tips

- **Resolution:** CRTs via composite are ~480i (NTSC) / 576i (PAL). Set the kiosk
  device's HDMI output to **720x480 (NTSC)** or **720x576 (PAL)**, or the lowest your
  converter accepts cleanly. On a Pi, set this in `/boot/firmware/config.txt`
  (`hdmi_group`/`hdmi_mode`) or via `raspi-config`.
- **Overscan:** real CRTs cut off the edges. If the spudcast UI is clipped, enable a
  little overscan (Pi: `overscan_left/right/top/bottom` in `config.txt`) until the
  channel bug and guide are fully visible.
- **Aspect ratio:** CRTs are 4:3. The player has an aspect toggle (the `A` key, or the
  remote) to switch contain / cover / fill so 16:9 content pillarboxes or zooms to taste.
- **Audio:** composite carries video only — route audio via the converter's RCA audio
  out (if present) or the device's headphone jack to your TV/speakers.

## 7. Keep the clock accurate (NTP)

The player joins each channel **mid-program at the live offset**, computed from the
current time. If the kiosk device's clock drifts, "live" drifts with it. Make sure NTP
is enabled:

```bash
sudo timedatectl set-ntp true
timedatectl status      # check "System clock synchronized: yes"
```

## 8. Player keyboard shortcuts (for testing without the remote)

| Key | Action |
|-----|--------|
| ↑ / ↓ (or PageUp/PageDown) | Channel up / down |
| `G` | Toggle the on-screen guide (shows the remote room code) |
| `A` | Cycle aspect ratio (contain / cover / fill) |
| `I` | Flash the channel bug |

## The weather channel

spudcast can run an always-live **weather channel** — a retro WeatherStar 4000+
display with your own background music.

- In the admin: **Channels → 🌤 Weather**. Set a channel number/name, a **WeatherStar
  URL**, and the **background audio**.
- The URL defaults to the public hosted ws4kp instance
  (`https://weatherstar.netbymatt.com`). Open it once in a browser and set your
  location there. For full control/offline use, **self-host ws4kp** (it's MIT-licensed,
  Docker-friendly) and point spudcast at your instance, e.g. `http://<nas-ip>:8081`.
- **Background audio:** *None*, a **YouTube URL** (lofi/jazz — best-effort, browser
  autoplay rules apply), or a **Jellyfin audio item id** (streamed through spudcast's
  proxy so your key stays server-side). Mute from the player/remote stops the Jellyfin
  bed.
- It joins instantly (no program loop) and shows as "Weather" in the channel bug.

## Troubleshooting

- **Black screen, no video:** confirm `--autoplay-policy=no-user-gesture-required`;
  check the channel is **On air** in admin and has items; a missing file shows the
  "Please Stand By" slate and auto-skips.
- **"No channels on air":** toggle a channel On air in admin → Channels.
- **Picture too zoomed / edges cut:** adjust overscan and the `A` aspect toggle.
- **Wrong programme vs. the guide:** check the kiosk clock / NTP (step 7).
