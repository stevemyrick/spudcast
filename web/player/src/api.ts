import type { Channel, NowPlaying, ScheduledProgram } from "@spudcast/shared";

const TOKEN_KEY = "spud_device_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

async function viewerFetch<T>(url: string): Promise<T> {
  const token = getToken();
  const res = await fetch(url, {
    headers: token ? { "x-spud-device": token } : {},
  });
  if (res.status === 401) {
    clearToken();
    throw new Error("unauthorized");
  }
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export interface PairStart {
  pairingId: string;
  code: string;
}
export type PairPoll = { status: "pending" } | { status: "paired"; token: string };

export const playerApi = {
  startPairing: () =>
    fetch("/api/devices/pair/start", { method: "POST" }).then((r) => r.json() as Promise<PairStart>),
  pollPairing: (pairingId: string) =>
    fetch(`/api/devices/pair/poll?pairingId=${encodeURIComponent(pairingId)}`).then(
      (r) => r.json() as Promise<PairPoll>,
    ),

  channels: () => viewerFetch<Channel[]>("/api/channels"),
  nowPlaying: (channelNumber: number) =>
    viewerFetch<NowPlaying>(`/api/now-playing/${channelNumber}`),
  guide: (channelNumber: number, count = 8) =>
    viewerFetch<ScheduledProgram[]>(`/api/guide/${channelNumber}?count=${count}`),

  /** Stream URL for a Jellyfin item, carrying the device token for <video>. */
  streamUrl: (jellyfinId: string) =>
    `/api/stream/jellyfin/${jellyfinId}?token=${encodeURIComponent(getToken() ?? "")}`,
  artUrl: (path: string) =>
    `${path}?token=${encodeURIComponent(getToken() ?? "")}`,
};
