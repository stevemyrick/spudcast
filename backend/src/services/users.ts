import argon2 from "argon2";
import type { User, UserRole } from "@spudcast/shared";
import { db } from "../db.js";

interface UserRow {
  id: number;
  username: string;
  passwordHash: string;
  role: UserRole;
  createdAt: string;
}

const byNameStmt = db.prepare<[string], UserRow>(
  "SELECT * FROM users WHERE username = ?",
);
const byIdStmt = db.prepare<[number], UserRow>(
  "SELECT * FROM users WHERE id = ?",
);
const countStmt = db.prepare<[], { n: number }>("SELECT COUNT(*) AS n FROM users");
const insertStmt = db.prepare<[string, string, UserRole]>(
  "INSERT INTO users (username, passwordHash, role) VALUES (?, ?, ?)",
);

function toUser(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    createdAt: row.createdAt,
  };
}

export function userCount(): number {
  return countStmt.get()!.n;
}

export function hasAdmin(): boolean {
  return userCount() > 0;
}

const adminCountStmt = db.prepare<[], { n: number }>(
  "SELECT COUNT(*) AS n FROM users WHERE role = 'admin'",
);
const listStmt = db.prepare<[], UserRow>("SELECT * FROM users ORDER BY id");
const deleteStmt = db.prepare<[number]>("DELETE FROM users WHERE id = ?");

export function listUsers(): User[] {
  return listStmt.all().map(toUser);
}

export function adminCount(): number {
  return adminCountStmt.get()!.n;
}

/**
 * Delete a user. Refuses to remove the last remaining admin so the station
 * can't be locked out. (Their channels cascade-delete via the FK.)
 */
export function deleteUser(id: number): void {
  const target = getUserById(id);
  if (!target) return;
  if (target.role === "admin" && adminCount() <= 1) {
    throw new Error("Cannot delete the last admin");
  }
  deleteStmt.run(id);
}

export function usernameExists(username: string): boolean {
  return Boolean(byNameStmt.get(username));
}

export async function createUser(
  username: string,
  password: string,
  role: UserRole,
): Promise<User> {
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const info = insertStmt.run(username, passwordHash, role);
  return getUserById(Number(info.lastInsertRowid))!;
}

export function getUserById(id: number): User | undefined {
  const row = byIdStmt.get(id);
  return row ? toUser(row) : undefined;
}

/** Verify credentials; returns the user on success, otherwise undefined. */
export async function verifyCredentials(
  username: string,
  password: string,
): Promise<User | undefined> {
  const row = byNameStmt.get(username);
  if (!row) {
    // Hash anyway to keep timing roughly constant against username probing.
    await argon2.hash(password, { type: argon2.argon2id }).catch(() => undefined);
    return undefined;
  }
  const ok = await argon2.verify(row.passwordHash, password).catch(() => false);
  return ok ? toUser(row) : undefined;
}
