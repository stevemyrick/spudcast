import { getSettings } from "./settings.js";

/** Shape of the Jellyfin /Items rows we request (subset of fields). */
export interface JellyfinItem {
  Id: string;
  Name: string;
  Type: string; // "Movie" | "Episode" | ...
  RunTimeTicks?: number;
  ProductionYear?: number;
  Genres?: string[];
  Tags?: string[];
  SeriesName?: string;
  ImageTags?: Record<string, string>;
  Overview?: string;
  OfficialRating?: string;
}

interface ItemsResponse {
  Items: JellyfinItem[];
  TotalRecordCount: number;
  StartIndex: number;
}

export interface SystemInfo {
  ServerName?: string;
  Version?: string;
}

const TICKS_PER_MS = 10_000;

function baseUrlOrThrow(): { baseUrl: string; apiKey: string } {
  const { jellyfin } = getSettings();
  if (!jellyfin.baseUrl || !jellyfin.apiKey) {
    throw new Error("Jellyfin is not configured");
  }
  return { baseUrl: jellyfin.baseUrl, apiKey: jellyfin.apiKey };
}

async function jfFetch(path: string, signal?: AbortSignal): Promise<Response> {
  const { baseUrl, apiKey } = baseUrlOrThrow();
  return fetch(`${baseUrl}${path}`, {
    headers: { "X-Emby-Token": apiKey, Accept: "application/json" },
    signal,
  });
}

/** Validate connectivity + credentials against the configured Jellyfin server. */
export async function testConnection(): Promise<SystemInfo> {
  const ac = AbortSignal.timeout(8000);
  const res = await jfFetch("/System/Info", ac);
  if (!res.ok) {
    throw new Error(`Jellyfin returned ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as SystemInfo;
}

export interface ListItemsParams {
  startIndex?: number;
  limit?: number;
  /** ISO date; only items saved after this are returned (incremental sync). */
  minDateLastSaved?: string | null;
}

/** Fetch one page of Movie/Episode items with the fields the scheduler needs. */
export async function listItems(params: ListItemsParams = {}): Promise<ItemsResponse> {
  const q = new URLSearchParams({
    Recursive: "true",
    IncludeItemTypes: "Movie,Episode",
    Fields: "Genres,Tags,ProductionYear,RunTimeTicks,Overview,SeriesName,OfficialRating",
    SortBy: "SortName",
    SortOrder: "Ascending",
    StartIndex: String(params.startIndex ?? 0),
    Limit: String(params.limit ?? 200),
    EnableImageTypes: "Primary",
  });
  if (params.minDateLastSaved) q.set("MinDateLastSaved", params.minDateLastSaved);

  const res = await jfFetch(`/Items?${q.toString()}`, AbortSignal.timeout(30000));
  if (!res.ok) {
    throw new Error(`Jellyfin /Items failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as ItemsResponse;
}

/** Convert Jellyfin RunTimeTicks to milliseconds. */
export function ticksToMs(ticks: number | undefined): number {
  return ticks ? Math.round(ticks / TICKS_PER_MS) : 0;
}

export interface StreamUrlOptions {
  /** Where to join the program, in ms (baked into the transcode via startTimeTicks). */
  offsetMs?: number;
}

/**
 * Build an absolute Jellyfin stream URL for an item. Used server-side by the
 * stream proxy (M2) — the api_key never reaches the browser.
 *
 * We always ask Jellyfin to remux/transcode into a progressive MP4 (H.264/AAC).
 * Most library files are MKV or carry codecs a browser's <video> can't decode
 * (E-AC3, HEVC, …); a raw direct-play stream renders black in that case. When
 * the source is already compatible H.264, Jellyfin stream-copies the video, so
 * this is a cheap remux rather than a full re-encode. The stream is not
 * byte-seekable, so mid-program joins are handled by startTimeTicks, not a
 * client-side currentTime seek.
 *
 * A video stream-copy can only *start* at a keyframe, so a mid-program join
 * would snap back to the previous keyframe (up to a GOP behind live). When an
 * offset is requested we therefore disable video copy so Jellyfin does a
 * frame-accurate seek and joins exactly at the live point. Offset 0 (start of an
 * item, e.g. a program boundary) is already a keyframe, so it keeps the cheap copy.
 */
export function buildStreamUrl(itemId: string, opts: StreamUrlOptions = {}): string {
  const { baseUrl, apiKey } = baseUrlOrThrow();
  const q = new URLSearchParams({
    api_key: apiKey,
    static: "false",
    container: "mp4",
    videoCodec: "h264",
    audioCodec: "aac",
  });
  if (opts.offsetMs && opts.offsetMs > 0) {
    q.set("startTimeTicks", String(Math.round(opts.offsetMs * TICKS_PER_MS)));
    // Frame-accurate join: re-encode instead of copying to the prior keyframe.
    q.set("allowVideoStreamCopy", "false");
  }
  return `${baseUrl}/Videos/${itemId}/stream.mp4?${q.toString()}`;
}

/** Build a Jellyfin audio stream URL (for the weather channel's background music). */
export function buildAudioStreamUrl(itemId: string): string {
  const { baseUrl, apiKey } = baseUrlOrThrow();
  return `${baseUrl}/Audio/${itemId}/universal?api_key=${encodeURIComponent(apiKey)}`;
}

/** Build the primary-image URL for an item (used by the artwork proxy). */
export function imageUrl(itemId: string, maxWidth = 400): string {
  const { baseUrl, apiKey } = baseUrlOrThrow();
  const q = new URLSearchParams({ api_key: apiKey, maxWidth: String(maxWidth) });
  return `${baseUrl}/Items/${itemId}/Images/Primary?${q.toString()}`;
}

/** Fetch the raw primary image bytes (server-side, for the artwork proxy). */
export async function fetchImage(
  itemId: string,
): Promise<{ body: ArrayBuffer; contentType: string } | null> {
  // Unreachable/unconfigured Jellyfin → null (art route 404s, never 500s).
  try {
    const res = await fetch(imageUrl(itemId), { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    return {
      body: await res.arrayBuffer(),
      contentType: res.headers.get("content-type") ?? "image/jpeg",
    };
  } catch {
    return null;
  }
}
