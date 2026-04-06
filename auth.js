/**
 * auth.js — Passkey (WebAuthn) authentication for Flat White Index admin portal
 *
 * Sections:
 *   1. Pure helpers  — no Supabase dependency (fully testable)
 *   2. Supabase helpers — sessions, invites, admin users, credentials
 *   3. WebAuthn flows — registration & authentication using @simplewebauthn/server
 */

import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";

// ---------------------------------------------------------------------------
// 1. Pure helpers
// ---------------------------------------------------------------------------

/**
 * Returns the WebAuthn relying party config from environment variables.
 * Falls back: WEBAUTHN_ORIGIN → WEBHOOK_BASE_URL for the origin.
 */
export function getRelyingParty() {
  const id = process.env.WEBAUTHN_RP_ID || "localhost";
  const name = process.env.WEBAUTHN_RP_NAME || "Flat White Index";
  const origin =
    process.env.WEBAUTHN_ORIGIN ||
    process.env.WEBHOOK_BASE_URL ||
    "http://localhost:3001";
  return { id, name, origin };
}

/** Returns 32 random bytes encoded as a 64-character hex string. */
export function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

/** Returns a SHA-256 hex digest of the given token string. */
export function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// ---------------------------------------------------------------------------
// Challenge store — in-process Map, single-use, 5-minute TTL
// ---------------------------------------------------------------------------

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** @type {Map<string, { data: any, expiresAt: number }>} */
const _challenges = new Map();

/** Remove all expired challenges from the store. */
function _sweepExpiredChallenges() {
  const now = Date.now();
  for (const [id, entry] of _challenges) {
    if (entry.expiresAt <= now) _challenges.delete(id);
  }
}

// Background sweep every 5 minutes — unref'd so it doesn't keep the process alive.
const _challengeSweepInterval = setInterval(_sweepExpiredChallenges, CHALLENGE_TTL_MS);
_challengeSweepInterval.unref();

/**
 * Store arbitrary challenge data for up to 5 minutes.
 * Sweeps expired entries before inserting.
 * @param {any} data
 * @returns {string} challengeId (UUID)
 */
export function storeChallengeData(data) {
  _sweepExpiredChallenges();
  const id = crypto.randomUUID();
  _challenges.set(id, { data, expiresAt: Date.now() + CHALLENGE_TTL_MS });
  return id;
}

/**
 * Retrieve and delete challenge data by ID (single-use).
 * Returns null if the ID is unknown or the entry has expired.
 * @param {string} id
 * @returns {any|null}
 */
export function getChallengeData(id) {
  const entry = _challenges.get(id);
  if (!entry) return null;
  _challenges.delete(id); // single-use
  if (entry.expiresAt <= Date.now()) return null;
  return entry.data;
}

// ---------------------------------------------------------------------------
// Supabase lazy singleton
// ---------------------------------------------------------------------------

let _supabase;

function supabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
  }
  return _supabase;
}

// ---------------------------------------------------------------------------
// 2. Supabase helpers
// ---------------------------------------------------------------------------

// --- Sessions ---

const SESSION_TTL_DAYS = 7;

/**
 * Create a new session for a user.
 * @param {string} userId
 * @returns {{ token: string, sessionId: string }}
 */
export async function createSession(userId) {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(
    Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data, error } = await supabase()
    .from("admin_sessions")
    .insert({ user_id: userId, token_hash: tokenHash, expires_at: expiresAt })
    .select("id")
    .single();

  if (error) throw new Error(`createSession: ${error.message}`);
  return { token, sessionId: data.id };
}

/**
 * Validate a raw session token. Hashes internally before lookup.
 * Returns the session row (with user_id) or null if invalid/expired.
 * @param {string} rawToken
 * @returns {object|null}
 */
export async function validateSession(rawToken) {
  if (!rawToken) return null;
  const tokenHash = hashToken(rawToken);

  const { data, error } = await supabase()
    .from("admin_sessions")
    .select("id, user_id, expires_at")
    .eq("token_hash", tokenHash)
    .single();

  if (error || !data) return null;
  if (new Date(data.expires_at) <= new Date()) {
    await supabase().from("admin_sessions").delete().eq("id", data.id);
    return null;
  }
  return data;
}

/**
 * Destroy a session by raw token.
 * @param {string} rawToken
 */
export async function destroySession(rawToken) {
  if (!rawToken) return;
  const tokenHash = hashToken(rawToken);
  await supabase()
    .from("admin_sessions")
    .delete()
    .eq("token_hash", tokenHash);
}

/** Delete all sessions whose expires_at is in the past. */
export async function cleanExpiredSessions() {
  const { error } = await supabase()
    .from("admin_sessions")
    .delete()
    .lt("expires_at", new Date().toISOString());

  if (error) throw new Error(`cleanExpiredSessions: ${error.message}`);
}

// --- Invites ---

const INVITE_TTL_HOURS = 24;

/**
 * Create a single-use invite code.
 * @param {string} adminUserId — the admin who is sending the invite
 * @returns {{ code: string, inviteId: string }}
 */
export async function createInvite(adminUserId) {
  const code = generateToken();
  const codeHash = hashToken(code);
  const expiresAt = new Date(
    Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000
  ).toISOString();

  const { data, error } = await supabase()
    .from("admin_invites")
    .insert({
      code_hash: codeHash,
      created_by: adminUserId,
      expires_at: expiresAt,
      used: false,
    })
    .select("id")
    .single();

  if (error) throw new Error(`createInvite: ${error.message}`);
  return { code, inviteId: data.id };
}

/**
 * Validate a raw invite code. Returns the invite row or null if invalid/expired/used.
 * @param {string} rawCode
 * @returns {object|null}
 */
export async function validateInvite(rawCode) {
  if (!rawCode) return null;
  const codeHash = hashToken(rawCode);

  const { data, error } = await supabase()
    .from("admin_invites")
    .select("id, created_by, expires_at, used")
    .eq("code_hash", codeHash)
    .single();

  if (error || !data) return null;
  if (data.used) return null;
  if (new Date(data.expires_at) <= new Date()) return null;
  return data;
}

/**
 * Mark an invite as used (call after successful registration).
 * @param {string} inviteId
 */
export async function markInviteUsed(inviteId) {
  const { error } = await supabase()
    .from("admin_invites")
    .update({ used: true, used_at: new Date().toISOString() })
    .eq("id", inviteId);

  if (error) throw new Error(`markInviteUsed: ${error.message}`);
}

// --- Admin users ---

/**
 * Returns the number of rows in admin_users.
 * Used to gate bootstrap (first-user) registration.
 * @returns {number}
 */
export async function getAdminUserCount() {
  const { count, error } = await supabase()
    .from("admin_users")
    .select("*", { count: "exact", head: true });

  if (error) throw new Error(`getAdminUserCount: ${error.message}`);
  return count ?? 0;
}

/**
 * Insert a new admin user.
 * @param {string} username
 * @param {string|null} invitedBy — user_id of the inviting admin (null for bootstrap)
 * @returns {object} — the new user row
 */
export async function createAdminUser(username, invitedBy = null) {
  const { data, error } = await supabase()
    .from("admin_users")
    .insert({ username, invited_by: invitedBy })
    .select()
    .single();

  if (error) throw new Error(`createAdminUser: ${error.message}`);
  return data;
}

/**
 * Return all admin users ordered by created_at.
 * @returns {object[]}
 */
export async function getAdminUsers() {
  const { data, error } = await supabase()
    .from("admin_users")
    .select("id, username, invited_by, created_at")
    .order("created_at", { ascending: true });

  if (error) throw new Error(`getAdminUsers: ${error.message}`);
  return data;
}

// --- Credentials ---

/**
 * Persist a WebAuthn credential for a user.
 * credential.id and credential.publicKey are stored as base64url strings.
 * @param {string} userId
 * @param {{ id: Uint8Array|string, publicKey: Uint8Array|Buffer, counter: number, transports?: string[] }} credential
 */
export async function storeCredential(userId, credential) {
  const credentialId =
    credential.id instanceof Uint8Array
      ? Buffer.from(credential.id).toString("base64url")
      : credential.id;

  const publicKey =
    credential.publicKey instanceof Uint8Array ||
    Buffer.isBuffer(credential.publicKey)
      ? Buffer.from(credential.publicKey).toString("base64url")
      : credential.publicKey;

  const { error } = await supabase()
    .from("admin_credentials")
    .insert({
      user_id: userId,
      credential_id: credentialId,
      public_key: publicKey,
      counter: credential.counter ?? 0,
      transports: credential.transports ?? [],
    });

  if (error) throw new Error(`storeCredential: ${error.message}`);
}

/**
 * Return all credentials (used when building the allowCredentials list for login).
 * @returns {object[]}
 */
export async function getAllCredentials() {
  const { data, error } = await supabase()
    .from("admin_credentials")
    .select("id, user_id, credential_id, public_key, counter, transports");

  if (error) throw new Error(`getAllCredentials: ${error.message}`);
  return data;
}

/**
 * Return all credentials belonging to a specific user.
 * @param {string} userId
 * @returns {object[]}
 */
export async function getCredentialsByUser(userId) {
  const { data, error } = await supabase()
    .from("admin_credentials")
    .select("id, user_id, credential_id, public_key, counter, transports")
    .eq("user_id", userId);

  if (error) throw new Error(`getCredentialsByUser: ${error.message}`);
  return data;
}

/**
 * Update the signature counter for a credential after successful authentication.
 * @param {string} credentialId — the DB row id (UUID)
 * @param {number} newCounter
 */
export async function updateCredentialCounter(credentialId, newCounter) {
  const { error } = await supabase()
    .from("admin_credentials")
    .update({ counter: newCounter })
    .eq("id", credentialId);

  if (error) throw new Error(`updateCredentialCounter: ${error.message}`);
}

// ---------------------------------------------------------------------------
// 3. WebAuthn flows
// ---------------------------------------------------------------------------

/**
 * Generate WebAuthn registration options for the very first admin (bootstrap).
 * Throws if admin_users is non-empty.
 * @param {string} username
 * @returns {{ options: PublicKeyCredentialCreationOptionsJSON, challengeId: string }}
 */
export async function generateBootstrapRegOptions(username) {
  const count = await getAdminUserCount();
  if (count > 0) {
    throw new Error(
      "Bootstrap registration is only allowed when no admin users exist"
    );
  }

  const { id: rpId, name: rpName, origin } = getRelyingParty();

  const options = await generateRegistrationOptions({
    rpName,
    rpID: rpId,
    userName: username,
    userDisplayName: username,
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  const challengeId = storeChallengeData({
    type: "bootstrap-registration",
    username,
    challenge: options.challenge,
    rpId,
    origin,
  });

  return { options, challengeId };
}

/**
 * Generate WebAuthn registration options for an invited user.
 * Validates the invite code before generating options.
 * @param {string} username
 * @param {string} inviteCode — raw (unhashed) invite code
 * @returns {{ options: PublicKeyCredentialCreationOptionsJSON, challengeId: string }}
 */
export async function generateInviteRegOptions(username, inviteCode) {
  const invite = await validateInvite(inviteCode);
  if (!invite) {
    throw new Error("Invalid or expired invite code");
  }

  const { id: rpId, name: rpName, origin } = getRelyingParty();

  const options = await generateRegistrationOptions({
    rpName,
    rpID: rpId,
    userName: username,
    userDisplayName: username,
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  const challengeId = storeChallengeData({
    type: "invite-registration",
    username,
    inviteId: invite.id,
    invitedBy: invite.created_by,
    challenge: options.challenge,
    rpId,
    origin,
  });

  return { options, challengeId };
}

/**
 * Verify a WebAuthn registration response and complete user setup.
 *
 * For bootstrap: re-checks that admin_users is still empty (race condition guard).
 * For invite: marks the invite as used.
 * Creates admin_user + credential + session on success.
 *
 * @param {string} challengeId
 * @param {object} credential — RegistrationResponseJSON from the browser
 * @returns {{ token: string, sessionId: string, user: object }}
 */
export async function verifyAndCompleteRegistration(challengeId, credential) {
  const challengeData = getChallengeData(challengeId);
  if (!challengeData) {
    throw new Error("Challenge not found, expired, or already used");
  }

  const { type, username, challenge, rpId, origin, inviteId, invitedBy } =
    challengeData;

  // Bootstrap race-condition guard: re-check emptiness inside the verify path
  if (type === "bootstrap-registration") {
    const count = await getAdminUserCount();
    if (count > 0) {
      throw new Error(
        "Bootstrap registration race condition: another admin was created concurrently"
      );
    }
  }

  const verification = await verifyRegistrationResponse({
    response: credential,
    expectedChallenge: challenge,
    expectedOrigin: origin,
    expectedRPID: rpId,
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error("WebAuthn registration verification failed");
  }

  const { credential: regCred } = verification.registrationInfo;

  // Persist user, credential, session — all should succeed or we surface the error
  const user = await createAdminUser(
    username,
    type === "invite-registration" ? invitedBy : null
  );

  await storeCredential(user.id, {
    id: regCred.id,
    publicKey: regCred.publicKey,
    counter: regCred.counter,
    transports: credential.response?.transports ?? [],
  });

  if (type === "invite-registration" && inviteId) {
    await markInviteUsed(inviteId);
  }

  const session = await createSession(user.id);

  return { token: session.token, sessionId: session.sessionId, user };
}

/**
 * Generate a WebAuthn authentication challenge.
 * Loads all registered credentials to build the allowCredentials list.
 * @returns {{ options: PublicKeyCredentialRequestOptionsJSON, challengeId: string }}
 */
export async function generateLoginChallenge() {
  const { id: rpId, origin } = getRelyingParty();

  const allCreds = await getAllCredentials();

  // Build allowCredentials from stored credential_id values (base64url → Uint8Array)
  const allowCredentials = allCreds.map((c) => ({
    id: c.credential_id,
    transports: c.transports ?? [],
  }));

  const options = await generateAuthenticationOptions({
    rpID: rpId,
    allowCredentials,
    userVerification: "preferred",
  });

  const challengeId = storeChallengeData({
    type: "authentication",
    challenge: options.challenge,
    rpId,
    origin,
    // Store credential metadata keyed by credential_id for quick lookup during verify
    credentials: Object.fromEntries(allCreds.map((c) => [c.credential_id, c])),
  });

  return { options, challengeId };
}

/**
 * Verify a WebAuthn authentication response.
 * Updates the credential counter and creates a new session on success.
 *
 * @param {string} challengeId
 * @param {object} credential — AuthenticationResponseJSON from the browser
 * @returns {{ token: string, sessionId: string, userId: string }}
 */
export async function verifyAndCompleteLogin(challengeId, credential) {
  const challengeData = getChallengeData(challengeId);
  if (!challengeData) {
    throw new Error("Challenge not found, expired, or already used");
  }

  const { challenge, rpId, origin, credentials } = challengeData;

  // Find the matching credential from the snapshot stored at challenge time
  const dbCred = credentials[credential.id];
  if (!dbCred) {
    throw new Error("Credential not recognised");
  }

  const authenticator = {
    credentialID: dbCred.credential_id,
    credentialPublicKey: Buffer.from(dbCred.public_key, "base64url"),
    counter: dbCred.counter,
    transports: dbCred.transports ?? [],
  };

  const verification = await verifyAuthenticationResponse({
    response: credential,
    expectedChallenge: challenge,
    expectedOrigin: origin,
    expectedRPID: rpId,
    credential: authenticator,
  });

  if (!verification.verified || !verification.authenticationInfo) {
    throw new Error("WebAuthn authentication verification failed");
  }

  const { newCounter } = verification.authenticationInfo;
  await updateCredentialCounter(dbCred.id, newCounter);

  const session = await createSession(dbCred.user_id);

  return { token: session.token, sessionId: session.sessionId, userId: dbCred.user_id };
}
