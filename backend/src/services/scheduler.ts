import type { Channel, LibraryItem, NowPlaying } from "@spudcast/shared";
import { getByNumber, getItems } from "./channels.js";

/**
 * Fixed anchor for the linear schedule. A channel's loop is a pure function of
 * (now - EPOCH) mod loopDuration, so "what's on now" is deterministic, survives
 * restarts, and naturally drops you mid-program — all computed from the SQLite
 * cache with zero Jellyfin calls. (Materialized program_entries are only needed
 * later for non-loop strategies like dayparts.)
 */
const SCHEDULE_EPOCH = Date.UTC(2022, 0, 1);

/** Guard against zero/negative durations corrupting the loop math. */
function safeDuration(item: LibraryItem): number {
  return item.durationMs > 0 ? item.durationMs : 1000;
}

export interface ScheduledProgram {
  item: LibraryItem;
  startUtc: string;
  endUtc: string;
}

interface LoopState {
  items: LibraryItem[];
  totalMs: number;
  /** Index of the item playing now. */
  index: number;
  /** Offset into the current item, ms. */
  offsetMs: number;
  /** Wall-clock start of the current item, ms since epoch. */
  currentStartMs: number;
}

function loopState(channelId: number, nowMs: number): LoopState | null {
  const items = getItems(channelId);
  if (items.length === 0) return null;
  const totalMs = items.reduce((sum, it) => sum + safeDuration(it), 0);
  if (totalMs <= 0) return null;

  const pos = (((nowMs - SCHEDULE_EPOCH) % totalMs) + totalMs) % totalMs;
  let acc = 0;
  for (let i = 0; i < items.length; i++) {
    const dur = safeDuration(items[i]);
    if (pos < acc + dur) {
      const offsetMs = pos - acc;
      return { items, totalMs, index: i, offsetMs, currentStartMs: nowMs - offsetMs };
    }
    acc += dur;
  }
  // Floating-point edge: fall back to the last item.
  const last = items.length - 1;
  return { items, totalMs, index: last, offsetMs: 0, currentStartMs: nowMs };
}

/** What's playing right now on a channel (by channel number), or null. */
export function nowPlaying(channelNumber: number): NowPlaying | null {
  const channel = getByNumber(channelNumber);
  if (!channel || !channel.enabled) return null;
  return nowPlayingForChannel(channel);
}

export function nowPlayingForChannel(channel: Channel): NowPlaying | null {
  const state = loopState(channel.id, Date.now());
  if (!state) return null;
  const item = state.items[state.index];
  const endMs = state.currentStartMs + safeDuration(item);
  return {
    channel,
    item,
    offsetMs: state.offsetMs,
    endsAt: new Date(endMs).toISOString(),
  };
}

/**
 * Upcoming programs for the on-screen guide, starting with what's on now.
 * Pure forward walk of the loop — no DB writes.
 */
export function getGuide(channelNumber: number, count = 8): ScheduledProgram[] {
  const channel = getByNumber(channelNumber);
  if (!channel) return [];
  const state = loopState(channel.id, Date.now());
  if (!state) return [];

  const programs: ScheduledProgram[] = [];
  let cursorMs = state.currentStartMs;
  let idx = state.index;
  for (let n = 0; n < count; n++) {
    const item = state.items[idx];
    const dur = safeDuration(item);
    programs.push({
      item,
      startUtc: new Date(cursorMs).toISOString(),
      endUtc: new Date(cursorMs + dur).toISOString(),
    });
    cursorMs += dur;
    idx = (idx + 1) % state.items.length;
  }
  return programs;
}
