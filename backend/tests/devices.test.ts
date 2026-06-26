import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "./helpers.js";
import {
  claimPairing,
  listDevices,
  pollPairing,
  revokeDevice,
  startPairing,
  verifyDeviceToken,
} from "../src/services/devices.js";

describe("device pairing", () => {
  beforeEach(() => resetDb());

  it("runs start → pending → claim → paired (token delivered once)", () => {
    const { pairingId, code } = startPairing();
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
    expect(pollPairing(pairingId)).toEqual({ status: "pending" });

    const device = claimPairing(code, "Living Room");
    expect(device.token).toHaveLength(64);

    const paired = pollPairing(pairingId);
    expect(paired.status).toBe("paired");
    if (paired.status === "paired") expect(paired.token).toBe(device.token);

    // The token is consumed — a second poll no longer returns it.
    expect(pollPairing(pairingId)).toEqual({ status: "pending" });
  });

  it("rejects an unknown code", () => {
    expect(() => claimPairing("ZZZZZZ", "x")).toThrow();
  });

  it("verifies and revokes device tokens", () => {
    const { code } = startPairing();
    const device = claimPairing(code, "TV");
    expect(verifyDeviceToken(device.token)?.id).toBe(device.id);
    expect(verifyDeviceToken("not-a-real-token")).toBeNull();

    expect(listDevices()).toHaveLength(1);
    revokeDevice(device.id);
    expect(verifyDeviceToken(device.token)).toBeNull();
    expect(listDevices()).toHaveLength(0);
  });
});
