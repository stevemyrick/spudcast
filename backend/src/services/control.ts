import { randomBytes } from "node:crypto";
import type { ControlServerMessage, RemoteCommand } from "@spudcast/shared";

/** Minimal surface we need from a WebSocket connection. */
export interface Socket {
  send(data: string): void;
}

interface Room {
  code: string;
  tv: Socket;
  remotes: Set<Socket>;
}

/**
 * In-memory hub linking a TV to its phone remotes. The TV opens a room and gets
 * a short code; a remote joins by entering that code (shown on the TV). Commands
 * from remotes are forwarded to the room's TV. Single-process only — fine for a
 * self-hosted single-instance deployment.
 */
const roomsByCode = new Map<string, Room>();
const roomByTv = new Map<Socket, Room>();

function newCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  const bytes = randomBytes(4);
  for (let i = 0; i < 4; i++) code += alphabet[bytes[i] % alphabet.length];
  return code;
}

function send(sock: Socket, msg: ControlServerMessage): void {
  try {
    sock.send(JSON.stringify(msg));
  } catch {
    /* socket may be closing */
  }
}

/** Register a TV connection, returning its (new) room code. */
export function openRoom(tv: Socket): string {
  let code = newCode();
  while (roomsByCode.has(code)) code = newCode();
  const room: Room = { code, tv, remotes: new Set() };
  roomsByCode.set(code, room);
  roomByTv.set(tv, room);
  send(tv, { type: "room", code });
  return code;
}

/** A remote joins an existing room by code. */
export function joinRoom(code: string, remote: Socket): boolean {
  const room = roomsByCode.get(code.toUpperCase());
  if (!room) {
    send(remote, { type: "error", message: "No TV with that code" });
    return false;
  }
  room.remotes.add(remote);
  send(remote, { type: "joined" });
  return true;
}

/** Forward a command from a remote to the TV in the same room. */
export function relayCommand(code: string, cmd: RemoteCommand): void {
  const room = roomsByCode.get(code.toUpperCase());
  if (room) send(room.tv, { type: "command", ...cmd });
}

/** Tear down on disconnect (TV closes the room; remotes just leave). */
export function dropSocket(sock: Socket): void {
  const tvRoom = roomByTv.get(sock);
  if (tvRoom) {
    roomsByCode.delete(tvRoom.code);
    roomByTv.delete(sock);
    return;
  }
  for (const room of roomsByCode.values()) room.remotes.delete(sock);
}
