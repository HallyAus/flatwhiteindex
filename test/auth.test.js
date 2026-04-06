import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import {
  hashToken,
  generateToken,
  storeChallengeData,
  getChallengeData,
  getRelyingParty,
} from "../auth.js";

// ---------------------------------------------------------------------------
// hashToken
// ---------------------------------------------------------------------------

describe("hashToken", () => {
  it("returns a 64-character hex string", () => {
    const hash = hashToken("sometoken");
    assert.strictEqual(typeof hash, "string");
    assert.strictEqual(hash.length, 64);
    assert.match(hash, /^[0-9a-f]{64}$/);
  });

  it("produces the same hash for the same input (deterministic)", () => {
    const token = "consistent-input";
    assert.strictEqual(hashToken(token), hashToken(token));
  });

  it("produces different hashes for different inputs", () => {
    assert.notStrictEqual(hashToken("token-a"), hashToken("token-b"));
  });
});

// ---------------------------------------------------------------------------
// generateToken
// ---------------------------------------------------------------------------

describe("generateToken", () => {
  it("returns a 64-character hex string", () => {
    const token = generateToken();
    assert.strictEqual(typeof token, "string");
    assert.strictEqual(token.length, 64);
    assert.match(token, /^[0-9a-f]{64}$/);
  });

  it("generates unique tokens on each call", () => {
    const tokens = new Set(Array.from({ length: 10 }, () => generateToken()));
    assert.strictEqual(tokens.size, 10);
  });
});

// ---------------------------------------------------------------------------
// Challenge store
// ---------------------------------------------------------------------------

describe("storeChallengeData / getChallengeData", () => {
  it("stores and retrieves challenge data by id", () => {
    const payload = { challenge: "abc123", username: "testuser" };
    const id = storeChallengeData(payload);

    assert.strictEqual(typeof id, "string");
    // UUID format
    assert.match(
      id,
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );

    const retrieved = getChallengeData(id);
    assert.deepStrictEqual(retrieved, payload);
  });

  it("returns null for an unknown challenge id", () => {
    const result = getChallengeData("00000000-0000-0000-0000-000000000000");
    assert.strictEqual(result, null);
  });

  it("is single-use — second retrieval returns null", () => {
    const id = storeChallengeData({ challenge: "one-time" });

    const first = getChallengeData(id);
    assert.notStrictEqual(first, null);

    const second = getChallengeData(id);
    assert.strictEqual(second, null);
  });

  it("stores different payloads under different ids", () => {
    const id1 = storeChallengeData({ value: 1 });
    const id2 = storeChallengeData({ value: 2 });

    assert.notStrictEqual(id1, id2);
    assert.deepStrictEqual(getChallengeData(id1), { value: 1 });
    assert.deepStrictEqual(getChallengeData(id2), { value: 2 });
  });
});

// ---------------------------------------------------------------------------
// getRelyingParty
// ---------------------------------------------------------------------------

describe("getRelyingParty", () => {
  it("returns an object with id, name, and origin", () => {
    const rp = getRelyingParty();
    assert.ok("id" in rp, "should have id");
    assert.ok("name" in rp, "should have name");
    assert.ok("origin" in rp, "should have origin");
  });

  it("uses WEBAUTHN_RP_ID env var when set", () => {
    const original = process.env.WEBAUTHN_RP_ID;
    process.env.WEBAUTHN_RP_ID = "mycafe.com.au";
    const rp = getRelyingParty();
    assert.strictEqual(rp.id, "mycafe.com.au");
    if (original === undefined) delete process.env.WEBAUTHN_RP_ID;
    else process.env.WEBAUTHN_RP_ID = original;
  });

  it("falls back to WEBHOOK_BASE_URL for origin when WEBAUTHN_ORIGIN is not set", () => {
    const savedOrigin = process.env.WEBAUTHN_ORIGIN;
    const savedWebhook = process.env.WEBHOOK_BASE_URL;

    delete process.env.WEBAUTHN_ORIGIN;
    process.env.WEBHOOK_BASE_URL = "https://webhook.example.com";

    const rp = getRelyingParty();
    assert.strictEqual(rp.origin, "https://webhook.example.com");

    // Restore
    if (savedOrigin !== undefined) process.env.WEBAUTHN_ORIGIN = savedOrigin;
    if (savedWebhook !== undefined) process.env.WEBHOOK_BASE_URL = savedWebhook;
    else delete process.env.WEBHOOK_BASE_URL;
  });

  it("prefers WEBAUTHN_ORIGIN over WEBHOOK_BASE_URL", () => {
    const savedOrigin = process.env.WEBAUTHN_ORIGIN;
    const savedWebhook = process.env.WEBHOOK_BASE_URL;

    process.env.WEBAUTHN_ORIGIN = "https://passkey.example.com";
    process.env.WEBHOOK_BASE_URL = "https://webhook.example.com";

    const rp = getRelyingParty();
    assert.strictEqual(rp.origin, "https://passkey.example.com");

    // Restore
    if (savedOrigin !== undefined) process.env.WEBAUTHN_ORIGIN = savedOrigin;
    else delete process.env.WEBAUTHN_ORIGIN;
    if (savedWebhook !== undefined) process.env.WEBHOOK_BASE_URL = savedWebhook;
    else delete process.env.WEBHOOK_BASE_URL;
  });
});
