import { getSettings, hasJellyfinConfigured } from "./settings.js";
import { isSyncing, syncLibrary } from "./sync.js";

let lastFiredMinute = "";

/** Local HH:mm right now. */
function currentHHmm(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * Start the daily-sync ticker. Checks once a minute and fires the library sync
 * when the local clock matches the configured time. This is the ONLY background
 * Jellyfin traffic — there is no polling otherwise, so an idle NAS stays quiet.
 */
export function startSyncSchedule(log: { info: (msg: string) => void; error: (msg: string) => void }): void {
  const tick = () => {
    if (!hasJellyfinConfigured() || isSyncing()) return;
    const now = currentHHmm();
    if (now !== getSettings().dailySyncTime) return;
    if (now === lastFiredMinute) return; // already fired this minute
    lastFiredMinute = now;
    log.info(`Daily library sync triggered at ${now}`);
    syncLibrary()
      .then((r) => log.info(`Daily sync done: +${r.added} added, ${r.updated} updated, ${r.total} total`))
      .catch((err) => log.error(`Daily sync failed: ${err instanceof Error ? err.message : String(err)}`));
  };
  setInterval(tick, 60_000);
}
