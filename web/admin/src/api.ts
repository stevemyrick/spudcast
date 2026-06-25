import type {
  ConnectionTestResult,
  LibraryPage,
  LibraryQuery,
  LibrarySyncResult,
  SessionInfo,
  SettingsUpdate,
  SettingsView,
  SetupRequest,
  SetupStatus,
  SyncStatus,
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
};
