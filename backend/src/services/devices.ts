import { randomBytes } from "node:crypto";
import { db } from "../db.js";

export interface Device {
  id: number;
  name: string;
  token: string;
  kind: "tv" | "remote";
  lastSeen: string | null;
}

interface PendingPairing {
  pairingId: string;
  code: string;
  token: string | null;
  expiresAt: number;
}

const PAIRING_TTL_MS = 10 * 60 * 1000; // 10 minutes
const pendingById = new Map<string, PendingPairing>();
const pendingByCode = new Map<string, string>();

function newCode(): string {
  // Unambiguous characters (no 0/O/1/I) for reading off a TV screen. The 32-char
  // alphabet lets us mask the low 5 bits (bytes[i] & 31) for an unbiased pick.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  const bytes = randomBytes(6);
  for (let i = 0; i < 6; i++) code += alphabet[bytes[i] & 31];
  return code;
}

function sweepExpired(): void {
  const now = Date.now();
  for (const [id, p] of pendingById) {
    if (p.expiresAt < now) {
      pendingById.delete(id);
      pendingByCode.delete(p.code);
    }
  }
}

/** TV side: begin pairing. Returns a code to display + a secret pairingId to poll. */
export function startPairing(): { pairingId: string; code: string } {
  sweepExpired();
  const pairingId = randomBytes(24).toString("hex");
  let code = newCode();
  while (pendingByCode.has(code)) code = newCode();
  pendingById.set(pairingId, { pairingId, code, token: null, expiresAt: Date.now() + PAIRING_TTL_MS });
  pendingByCode.set(code, pairingId);
  return { pairingId, code };
}

/** Admin side: claim a displayed code, minting a device token. */
export function claimPairing(code: string, name: string, kind: "tv" | "remote" = "tv"): Device {
  sweepExpired();
  const pairingId = pendingByCode.get(code.toUpperCase());
  const pending = pairingId ? pendingById.get(pairingId) : undefined;
  if (!pending) throw new Error("Invalid or expired code");

  const token = randomBytes(32).toString("hex");
  const info = db
    .prepare("INSERT INTO devices (name, token, kind, lastSeen) VALUES (?, ?, ?, datetime('now'))")
    .run(name, token, kind);
  pending.token = token;
  return {
    id: Number(info.lastInsertRowid),
    name,
    token,
    kind,
    lastSeen: new Date().toISOString(),
  };
}

/** TV side: poll until the pairing is claimed; then receive the token once. */
export function pollPairing(pairingId: string): { status: "pending" } | { status: "paired"; token: string } {
  sweepExpired();
  const pending = pendingById.get(pairingId);
  if (!pending) return { status: "pending" }; // unknown/expired — keep TV polling
  if (!pending.token) return { status: "pending" };
  const token = pending.token;
  pendingById.delete(pairingId);
  pendingByCode.delete(pending.code);
  return { status: "paired", token };
}

/** Validate a device token and bump lastSeen. */
export function verifyDeviceToken(token: string): Device | null {
  const row = db.prepare("SELECT * FROM devices WHERE token = ?").get(token) as
    | { id: number; name: string; token: string; kind: "tv" | "remote"; lastSeen: string | null }
    | undefined;
  if (!row) return null;
  db.prepare("UPDATE devices SET lastSeen = datetime('now') WHERE id = ?").run(row.id);
  return { id: row.id, name: row.name, token: row.token, kind: row.kind, lastSeen: row.lastSeen };
}

export function listDevices(): Array<Omit<Device, "token">> {
  const rows = db.prepare("SELECT id, name, kind, lastSeen FROM devices ORDER BY id").all() as Array<
    Omit<Device, "token">
  >;
  return rows;
}

export function revokeDevice(id: number): void {
  db.prepare("DELETE FROM devices WHERE id = ?").run(id);
}
