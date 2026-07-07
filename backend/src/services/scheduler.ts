import type { Channel, ChannelConfig, LibraryItem, NowPlaying } from "@spudcast/shared";
import { getByNumber, resolveChannelItems } from "./channels.js";

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

function loopState(channel: Channel, nowMs: number): LoopState | null {
  const items = resolveChannelItems(channel);
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
  // The weather channel is always live — no program loop.
  if (channel.type === "weather") {
    const weather = (channel.config as ChannelConfig | null)?.weather;
    if (!weather?.embedUrl) return null;
    return { kind: "weather", channel, weather };
  }

  const state = loopState(channel, Date.now());
  if (!state) return null;
  const item = state.items[state.index];
  const endMs = state.currentStartMs + safeDuration(item);
  return {
    kind: "program",
    channel,
    item,
    offsetMs: state.offsetMs,
    endsAt: new Date(endMs).toISOString(),
  };
}

/**
 * The current loop iteration's program times, in broadcast order (incl. filler).
 * Anchored to the start of the loop pass that's airing now, so times shift as
 * items are reordered (durations re-accumulate) and advance when the loop
 * restarts. Used by the channel editor's on-air schedule.
 */
export function getChannelSchedule(channel: Channel, nowMs = Date.now()): ScheduledProgram[] {
  const state = loopState(channel, nowMs);
  if (!state) return [];
  const pos = (((nowMs - SCHEDULE_EPOCH) % state.totalMs) + state.totalMs) % state.totalMs;
  const iterationStartMs = nowMs - pos; // wall-clock start of the current pass
  const programs: ScheduledProgram[] = [];
  let cursorMs = iterationStartMs;
  for (const item of state.items) {
    const dur = safeDuration(item);
    programs.push({
      item,
      startUtc: new Date(cursorMs).toISOString(),
      endUtc: new Date(cursorMs + dur).toISOString(),
    });
    cursorMs += dur;
  }
  return programs;
}

/**
 * Forward walk of a channel's loop from now until `endMs`, for the grid guide.
 * Guarded against pathological tiny-duration loops.
 */
export function getGuideUntil(
  channel: Channel,
  endMs: number,
  nowMs = Date.now(),
): ScheduledProgram[] {
  const state = loopState(channel, nowMs);
  if (!state) return [];
  const programs: ScheduledProgram[] = [];
  let cursorMs = state.currentStartMs;
  let idx = state.index;
  for (let guard = 0; cursorMs < endMs && guard < 1000; guard++) {
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

/**
 * Upcoming programs for the on-screen guide, starting with what's on now.
 * Pure forward walk of the loop — no DB writes.
 */
export function getGuide(channelNumber: number, count = 8): ScheduledProgram[] {
  const channel = getByNumber(channelNumber);
  if (!channel) return [];
  const state = loopState(channel, Date.now());
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
