import type {
  SessionInfo,
  SetupRequest,
  SetupStatus,
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
};
