import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { FastifyReply, FastifyRequest } from "fastify";
import { secretFilePath, config } from "./config.js";
import { getUserById } from "./services/users.js";
import type { User } from "@spudcast/shared";

const COOKIE_NAME = "spud_session";

/** Resolve a stable cookie-signing secret, generating + persisting one if needed. */
export function resolveCookieSecret(): string {
  if (config.cookieSecret) return config.cookieSecret;
  if (existsSync(secretFilePath)) return readFileSync(secretFilePath, "utf8").trim();
  const secret = randomBytes(48).toString("hex");
  writeFileSync(secretFilePath, secret, { mode: 0o600 });
  return secret;
}

export function setSession(reply: FastifyReply, userId: number): void {
  reply.setCookie(COOKIE_NAME, String(userId), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProduction,
    signed: true,
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
}

export function clearSession(reply: FastifyReply): void {
  reply.clearCookie(COOKIE_NAME, { path: "/" });
}

/** Return the logged-in user for this request, or null. */
export function getSessionUser(req: FastifyRequest): User | null {
  const raw = req.cookies[COOKIE_NAME];
  if (!raw) return null;
  const unsigned = req.unsignCookie(raw);
  if (!unsigned.valid || !unsigned.value) return null;
  const id = Number(unsigned.value);
  if (!Number.isInteger(id)) return null;
  return getUserById(id) ?? null;
}
