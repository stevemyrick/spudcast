import type {
  AutoRules,
  Channel,
  ChannelWithItems,
  ConnectionTestResult,
  CreateChannelRequest,
  LibraryItem,
  LibraryPage,
  LibraryQuery,
  LibrarySyncResult,
  SessionInfo,
  SettingsUpdate,
  SettingsView,
  SetupRequest,
  SetupStatus,
  SyncStatus,
  UpdateChannelRequest,
  User,
} from "@spudcast/shared";

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    credentials: "same-origin",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getSetupStatus: () => jsonFetch<SetupStatus>("/api/setup/status"),
  completeSetup: (body: SetupRequest) =>
    jsonFetch<{ user: User; status: SetupStatus }>("/api/setup", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  me: () => jsonFetch<SessionInfo>("/api/auth/me"),
  login: (username: string, password: string) =>
    jsonFetch<SessionInfo>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => jsonFetch<SessionInfo>("/api/auth/logout", { method: "POST" }),

  // --- Library ---
  library: (q: LibraryQuery = {}) => {
    const params = new URLSearchParams();
    if (q.type) params.set("type", q.type);
    if (q.genre) params.set("genre", q.genre);
    if (q.search) params.set("search", q.search);
    if (q.limit != null) params.set("limit", String(q.limit));
    if (q.offset != null) params.set("offset", String(q.offset));
    const qs = params.toString();
    return jsonFetch<LibraryPage>(`/api/library${qs ? `?${qs}` : ""}`);
  },
  syncStatus: () => jsonFetch<SyncStatus>("/api/library/sync-status"),
  refreshLibrary: () =>
    jsonFetch<LibrarySyncResult>("/api/library/refresh", { method: "POST" }),
  genres: () => jsonFetch<string[]>("/api/library/genres"),
  previewRules: (rules: AutoRules) =>
    jsonFetch<{ count: number; sample: string[] }>("/api/library/preview", {
      method: "POST",
      body: JSON.stringify(rules),
    }),

  // --- Settings ---
  getSettings: () => jsonFetch<SettingsView>("/api/settings"),
  updateSettings: (body: SettingsUpdate) =>
    jsonFetch<SettingsView>("/api/settings", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  testJellyfin: () =>
    jsonFetch<ConnectionTestResult>("/api/settings/jellyfin/test", { method: "POST" }),

  // --- Devices (TV pairing) ---
  listDevices: () =>
    jsonFetch<Array<{ id: number; name: string; kind: string; lastSeen: string | null }>>(
      "/api/devices",
    ),
  claimDevice: (code: string, name: string) =>
    jsonFetch<{ id: number; name: string; kind: string }>("/api/devices/pair/claim", {
      method: "POST",
      body: JSON.stringify({ code, name }),
    }),
  revokeDevice: (id: number) =>
    jsonFetch<{ ok: boolean }>(`/api/devices/${id}`, { method: "DELETE" }),

  // --- Users (admin) ---
  listUsers: () => jsonFetch<User[]>("/api/users"),
  createUser: (username: string, password: string, role: "admin" | "user") =>
    jsonFetch<User>("/api/users", {
      method: "POST",
      body: JSON.stringify({ username, password, role }),
    }),
  deleteUser: (id: number) =>
    jsonFetch<{ ok: boolean }>(`/api/users/${id}`, { method: "DELETE" }),

  // --- Channels ---
  channels: (all = true) => jsonFetch<Channel[]>(`/api/channels${all ? "?all=true" : ""}`),
  channel: (id: number) => jsonFetch<ChannelWithItems>(`/api/channels/${id}`),
  createChannel: (body: CreateChannelRequest) =>
    jsonFetch<Channel>("/api/channels", { method: "POST", body: JSON.stringify(body) }),
  updateChannel: (id: number, body: UpdateChannelRequest) =>
    jsonFetch<Channel>(`/api/channels/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteChannel: (id: number) =>
    jsonFetch<{ ok: boolean }>(`/api/channels/${id}`, { method: "DELETE" }),
  setChannelItems: (id: number, libraryItemIds: number[]) =>
    jsonFetch<{ ok: boolean; items: number }>(`/api/channels/${id}/items`, {
      method: "PUT",
      body: JSON.stringify({ libraryItemIds }),
    }),

  /** Upload a local clip; duration is read in-browser and sent along. */
  uploadLocal: async (file: File, type: string, durationMs: number, title: string) => {
    const fd = new FormData();
    fd.append("type", type);
    fd.append("durationMs", String(durationMs));
    fd.append("title", title);
    fd.append("file", file);
    const res = await fetch("/api/library/upload", { method: "POST", body: fd, credentials: "same-origin" });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      throw new Error((b as { error?: string }).error ?? `Upload failed: ${res.status}`);
    }
    return (await res.json()) as LibraryItem;
  },
};

/** Read a video file's duration in the browser (so the backend needs no ffmpeg). */
export function readDurationMs(file: File): Promise<number> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(v.src);
      resolve(Number.isFinite(v.duration) ? Math.round(v.duration * 1000) : 0);
    };
    v.onerror = () => resolve(0);
    v.src = URL.createObjectURL(file);
  });
}
