import { describe, expect, it } from "vitest";
import { dropSocket, joinRoom, openRoom, relayCommand, type Socket } from "../src/services/control.js";

/** A fake socket that records everything sent to it. */
function fakeSocket() {
  const sent: unknown[] = [];
  const sock: Socket = { send: (d: string) => sent.push(JSON.parse(d)) };
  return { sock, sent };
}

describe("remote-control hub", () => {
  it("links a TV room to a remote and relays commands", () => {
    const tv = fakeSocket();
    const remote = fakeSocket();

    const code = openRoom(tv.sock);
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
    expect(tv.sent).toContainEqual({ type: "room", code });

    expect(joinRoom(code, remote.sock)).toBe(true);
    expect(remote.sent).toContainEqual({ type: "joined" });

    relayCommand(code, { action: "channel_up" });
    expect(tv.sent).toContainEqual({ type: "command", action: "channel_up" });
  });

  it("rejects joining an unknown room", () => {
    const remote = fakeSocket();
    expect(joinRoom("ZZZZ", remote.sock)).toBe(false);
    expect(remote.sent[0]).toMatchObject({ type: "error" });
  });

  it("tears down the room when the TV disconnects", () => {
    const tv = fakeSocket();
    const remote = fakeSocket();
    const code = openRoom(tv.sock);
    dropSocket(tv.sock);
    expect(joinRoom(code, remote.sock)).toBe(false);
  });
});
