import type { LibrarySyncResult, SyncStatus } from "@spudcast/shared";
import { getSettings, setLastSyncAt } from "./settings.js";
import { listItems } from "./jellyfin.js";
import { count, mapJellyfinItem, upsertMany } from "./library.js";

const PAGE_SIZE = 200;

let running = false;

export function isSyncing(): boolean {
  return running;
}

export function getSyncStatus(): SyncStatus {
  return {
    lastSyncAt: getSettings().lastSyncAt ?? null,
    itemCount: count(),
    running,
  };
}

/**
 * Pull the Jellyfin library into the local cache. Incremental by default: only
 * items changed since the last sync are fetched (via MinDateLastSaved). Pass
 * `{ full: true }` to re-pull everything.
 */
export async function syncLibrary(
  opts: { full?: boolean } = {},
): Promise<LibrarySyncResult> {
  if (running) throw new Error("A sync is already in progress");
  running = true;
  const startedAt = new Date().toISOString();
  try {
    const { lastSyncAt } = getSettings();
    const incremental = !opts.full && Boolean(lastSyncAt);
    const minDateLastSaved = incremental ? lastSyncAt : null;

    let added = 0;
    let updated = 0;
    let startIndex = 0;
    let totalRecords = Infinity;

    while (startIndex < totalRecords) {
      const page = await listItems({ startIndex, limit: PAGE_SIZE, minDateLastSaved });
      totalRecords = page.TotalRecordCount;
      if (page.Items.length === 0) break;

      const mapped = page.Items.map(mapJellyfinItem);
      const res = upsertMany(mapped);
      added += res.added;
      updated += res.updated;
      startIndex += page.Items.length;
    }

    const finishedAt = new Date().toISOString();
    // Record the sync start time as the new watermark so anything saved during
    // the run is caught next time.
    setLastSyncAt(startedAt);

    return { added, updated, total: count(), startedAt, finishedAt, incremental };
  } finally {
    running = false;
  }
}
